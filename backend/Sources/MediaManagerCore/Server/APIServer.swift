import Foundation
import Hummingbird
import HummingbirdWebSocket
import NIOCore
import HTTPTypes
import AppKit

public struct RegisterDriveRequest: Codable {
    public let mountPath: String
    public let driveName: String?
}

public struct UpdateFavoriteRequest: Codable {
    public let isFavorite: Bool
}

public struct CreateAlbumRequest: Codable {
    public let name: String
    public let description: String?
    public let albumType: AlbumType?
    public let rules: SmartAlbumRules?
}

public struct AlbumAssetsRequest: Codable {
    public let assetIds: [String]
}

public struct DeviceBackupRequest: Codable, Sendable {
    public let driveId: String
    public let mediaType: String?

    public init(driveId: String, mediaType: String? = nil) {
        self.driveId = driveId
        self.mediaType = mediaType
    }
}

public struct APIServer: Sendable {
    private let startTime: Date

    public init() {
        self.startTime = Date()
    }

    public func buildRouter() -> Router<BasicWebSocketRequestContext> {
        let router = Router(context: BasicWebSocketRequestContext.self)

        // CORS & Security headers
        router.add(middleware: CORSMiddleware(
            allowOrigin: .originBased,
            allowHeaders: [.contentType, .authorization, HTTPField.Name("X-MediaManager-Token")!],
            allowMethods: [.get, .post, .put, .patch, .delete, .options]
        ))

        // WebSocket endpoint
        router.ws("/ws") { inbound, outbound, context in
            let clientId = UUID()
            await WebSocketHub.shared.addClient(id: clientId, outbound: outbound)

            // Send initial ping
            await WebSocketHub.shared.broadcast(event: "connection.ready", data: ["clientId": clientId.uuidString])

            do {
                for try await message in inbound.messages(maxSize: .max) {
                    if case .text(let text) = message {
                        if text == "ping" {
                            try await outbound.write(.text("pong"))
                        }
                    }
                }
            } catch {}

            await WebSocketHub.shared.removeClient(id: clientId)
        }

        // MARK: - System Health
        router.get("/api/v1/system/health") { _, _ -> Response in
            let drives = (try? await DatabaseManager.shared.getAllDrives()) ?? []
            let (_, totalAssets) = (try? await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(limit: 0))) ?? ([], 0)

            let connectedDrives = drives.filter { $0.status == .connected }.count
            let uptime = Date().timeIntervalSince(self.startTime)

            let health: [String: Any] = [
                "status": "ok",
                "version": "1.0.0",
                "databasePath": SystemPaths.databaseURL.path,
                "storagePath": SystemPaths.appSupportDirectory.path,
                "connectedDrivesCount": connectedDrives,
                "totalDrivesCount": drives.count,
                "totalAssetsCount": totalAssets,
                "uptimeSeconds": uptime
            ]

            let data = try JSONSerialization.data(withJSONObject: health)
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(data: data))
            )
        }

        // MARK: - iOS Devices & iPhone Auto Backup
        router.get("/api/v1/devices") { _, _ -> Response in
            let devices = await IOSDeviceManager.shared.getConnectedDevices()
            let data = try JSONEncoder().encode(devices)
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(data: data))
            )
        }

        router.post("/api/v1/devices/backup") { request, _ -> Response in
            do {
                let buffer = try await request.body.collect(upTo: 1_000_000)
                let req = try JSONDecoder().decode(DeviceBackupRequest.self, from: Data(buffer.readableBytesView))
                let session = try await IOSDeviceManager.shared.startBackup(
                    driveId: req.driveId,
                    mediaType: req.mediaType ?? "all"
                )
                let data = try JSONEncoder().encode(session)
                return Response(
                    status: .accepted,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: data))
                )
            } catch {
                let errData = (try? JSONSerialization.data(withJSONObject: [
                    "error": error.localizedDescription
                ])) ?? Data()
                return Response(
                    status: .badRequest,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: errData))
                )
            }
        }

        router.get("/api/v1/devices/backup/status") { _, _ -> Response in
            let status = await IOSDeviceManager.shared.getBackupStatus()
            let data = try JSONEncoder().encode(status)
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(data: data))
            )
        }

        // MARK: - Filesystem Browsing
        router.get("/api/v1/filesystem/browse") { request, _ -> Response in
            let uri = request.uri
            let queryParams = parseQueryParams(uri.query ?? "")
            let path = queryParams["path"]
            do {
                let result = try await FileSystemManager.shared.browse(path: path)
                let data = try JSONEncoder().encode(result)
                return Response(
                    status: .ok,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: data))
                )
            } catch {
                let errData = (try? JSONSerialization.data(withJSONObject: [
                    "error": error.localizedDescription
                ])) ?? Data()
                return Response(
                    status: .badRequest,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: errData))
                )
            }
        }

        router.post("/api/v1/filesystem/pick-folder") { _, _ -> Response in
            let selectedPath = await FileSystemManager.shared.pickFolderWithNativeDialog()
            var dict: [String: Any] = [:]
            if let p = selectedPath {
                dict["path"] = p
            } else {
                dict["path"] = NSNull()
            }
            let data = (try? JSONSerialization.data(withJSONObject: dict)) ?? Data()
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(data: data))
            )
        }

        // MARK: - Drives
        router.get("/api/v1/drives") { _, _ -> Response in
            // Re-sync mounted volumes
            let drives = try await DriveManager.shared.syncMountedVolumes()
            let data = try JSONEncoder().encode(drives)
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(data: data))
            )
        }

        router.post("/api/v1/drives/register") { request, context -> Response in
            do {
                let buffer = try await request.body.collect(upTo: 1_000_000)
                let regReq = try JSONDecoder().decode(RegisterDriveRequest.self, from: Data(buffer.readableBytesView))

                let record = try await DriveManager.shared.registerDrive(
                    mountPath: regReq.mountPath,
                    customName: regReq.driveName
                )

                await WebSocketHub.shared.broadcast(event: "drive.registered", data: [
                    "id": record.id,
                    "name": record.driveName,
                    "mountPath": record.mountPath ?? ""
                ])

                let data = try JSONEncoder().encode(record)
                return Response(
                    status: .created,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: data))
                )
            } catch {
                let errData = (try? JSONSerialization.data(withJSONObject: [
                    "error": error.localizedDescription
                ])) ?? Data()
                return Response(
                    status: .badRequest,
                    headers: [.contentType: "application/json"],
                    body: .init(byteBuffer: ByteBuffer(data: errData))
                )
            }
        }

        router.post("/api/v1/drives/:id/scan") { request, context -> Response in
            guard let driveId = context.parameters.get("id") else {
                return Response(status: .badRequest)
            }

            if await DriveManager.shared.isRebuilding(driveId: driveId) {
                let errData = try JSONSerialization.data(withJSONObject: ["error": "Rebuild is already in progress for this drive."])
                return Response(status: .conflict, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: errData)))
            }

            // Asynchronous rebuild/scan
            Task {
                do {
                    await WebSocketHub.shared.broadcast(event: "catalog.rebuild.started", data: [
                        "driveId": driveId,
                        "status": "started"
                    ])
                    let result = try await DriveManager.shared.rebuildCatalog(driveId: driveId) { current, total, filename in
                        Task {
                            await WebSocketHub.shared.broadcast(event: "catalog.rebuild.progress", data: [
                                "driveId": driveId,
                                "current": current,
                                "total": total,
                                "currentFile": filename,
                                "percent": total > 0 ? Int((Double(current) / Double(total)) * 100) : 0
                            ])
                        }
                    }
                    await WebSocketHub.shared.broadcast(event: "catalog.rebuild.completed", data: [
                        "driveId": driveId,
                        "scanned": result.scanned,
                        "added": result.added,
                        "updated": result.updated,
                        "pruned": result.pruned
                    ])
                } catch {
                    print("[backend] Catalog rebuild failed for drive \(driveId): \(error.localizedDescription)")
                    await WebSocketHub.shared.broadcast(event: "catalog.rebuild.failed", data: [
                        "driveId": driveId,
                        "error": error.localizedDescription
                    ])
                }
            }

            let respData = try JSONSerialization.data(withJSONObject: ["status": "scan_started", "driveId": driveId])
            return Response(status: .accepted, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: respData)))
        }

        router.delete("/api/v1/drives/:id") { _, context -> Response in
            guard let driveId = context.parameters.get("id") else {
                return Response(status: .badRequest)
            }
            try await DriveManager.shared.unregisterDrive(driveId: driveId)
            return Response(
                status: .ok,
                headers: [.contentType: "application/json"],
                body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"deleted\"}"))
            )
        }

        // MARK: - Assets
        router.get("/api/v1/assets") { request, _ -> Response in
            let uri = request.uri
            let queryParams = parseQueryParams(uri.query ?? "")

            let mediaTypeStr = queryParams["mediaType"]
            let mediaType = mediaTypeStr != nil ? MediaType(rawValue: mediaTypeStr!) : nil

            let isFavorite = queryParams["isFavorite"].map { $0 == "true" || $0 == "1" }
            let driveId = queryParams["driveId"]
            let albumId = queryParams["albumId"]
            let searchQuery = queryParams["q"]
            let year = queryParams["year"].flatMap { Int($0) }
            let country = queryParams["country"]
            let city = queryParams["city"]
            let startDate = queryParams["startDate"]
            let endDate = queryParams["endDate"]
            let limit = Int(queryParams["limit"] ?? "50") ?? 50
            let offset = Int(queryParams["offset"] ?? "0") ?? 0

            let filter = AssetQueryFilter(
                mediaType: mediaType,
                isFavorite: isFavorite,
                driveId: driveId,
                albumId: albumId,
                searchQuery: searchQuery,
                year: year,
                country: country,
                city: city,
                startDate: startDate,
                endDate: endDate,
                limit: limit,
                offset: offset
            )

            let (assets, total) = try await DatabaseManager.shared.queryAssets(filter: filter)

            struct AssetsResponse: Codable {
                let assets: [AssetRecord]
                let total: Int
                let limit: Int
                let offset: Int
            }

            let resp = AssetsResponse(assets: assets, total: total, limit: limit, offset: offset)
            let data = try JSONEncoder().encode(resp)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.get("/api/v1/assets/:id") { request, context -> Response in
            guard let assetId = context.parameters.get("id"),
                  let asset = try await DatabaseManager.shared.getAsset(id: assetId) else {
                return Response(status: .notFound)
            }
            let data = try JSONEncoder().encode(asset)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.patch("/api/v1/assets/:id") { request, context -> Response in
            guard let assetId = context.parameters.get("id") else { return Response(status: .badRequest) }
            let buffer = try await request.body.collect(upTo: 1_000_000)
            let favReq = try JSONDecoder().decode(UpdateFavoriteRequest.self, from: Data(buffer.readableBytesView))

            try await DatabaseManager.shared.updateAssetFavorite(id: assetId, isFavorite: favReq.isFavorite)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"updated\"}")))
        }

        // Cached thumbnail serving (works 100% offline, on-demand fallback when connected)
        router.get("/api/v1/assets/:id/thumbnail") { _, context -> Response in
            guard let assetId = context.parameters.get("id"),
                  let asset = try await DatabaseManager.shared.getAsset(id: assetId) else {
                return Response(status: .notFound)
            }

            if let thumbPath = asset.thumbnailPath {
                let fileURL = SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbPath)
                if let data = try? Data(contentsOf: fileURL) {
                    return Response(
                        status: .ok,
                        headers: [
                            .contentType: "image/jpeg",
                            .cacheControl: "public, max-age=86400"
                        ],
                        body: .init(byteBuffer: ByteBuffer(data: data))
                    )
                }
            }

            // On-demand generation if drive is connected
            if let drive = try? await DatabaseManager.shared.getDrive(id: asset.driveId),
               let mountPath = drive.mountPath,
               (drive.status == .connected || drive.status == .rebuilding) {
                let sourceURL = URL(fileURLWithPath: mountPath).appendingPathComponent(asset.relativePath)
                if FileManager.default.fileExists(atPath: sourceURL.path) {
                    if let thumbs = try? await MediaProcessor.shared.generateThumbnailAndPreview(sourceURL: sourceURL, assetId: asset.id) {
                        try? await DatabaseManager.shared.updateAssetThumbnails(id: asset.id, thumbnailPath: thumbs.thumbnailPath, previewPath: thumbs.previewPath)
                        let fileURL = SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbs.thumbnailPath)
                        if let data = try? Data(contentsOf: fileURL) {
                            return Response(
                                status: .ok,
                                headers: [
                                    .contentType: "image/jpeg",
                                    .cacheControl: "public, max-age=86400"
                                ],
                                body: .init(byteBuffer: ByteBuffer(data: data))
                            )
                        }
                    }
                }
            }

            return Response(status: .notFound)
        }

        // Cached preview serving (works 100% offline, on-demand fallback when connected)
        router.get("/api/v1/assets/:id/preview") { _, context -> Response in
            guard let assetId = context.parameters.get("id"),
                  let asset = try await DatabaseManager.shared.getAsset(id: assetId) else {
                return Response(status: .notFound)
            }

            if let prevPath = asset.previewPath {
                let fileURL = SystemPaths.previewsDirectory.appendingPathComponent(prevPath)
                if let data = try? Data(contentsOf: fileURL) {
                    return Response(
                        status: .ok,
                        headers: [
                            .contentType: "image/jpeg",
                            .cacheControl: "public, max-age=86400"
                        ],
                        body: .init(byteBuffer: ByteBuffer(data: data))
                    )
                }
            }

            // Fallback to thumbnail if already generated
            if let thumbPath = asset.thumbnailPath {
                let fileURL = SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbPath)
                if let data = try? Data(contentsOf: fileURL) {
                    return Response(
                        status: .ok,
                        headers: [
                            .contentType: "image/jpeg",
                            .cacheControl: "public, max-age=86400"
                        ],
                        body: .init(byteBuffer: ByteBuffer(data: data))
                    )
                }
            }

            // On-demand generation if drive is connected
            if let drive = try? await DatabaseManager.shared.getDrive(id: asset.driveId),
               let mountPath = drive.mountPath,
               (drive.status == .connected || drive.status == .rebuilding) {
                let sourceURL = URL(fileURLWithPath: mountPath).appendingPathComponent(asset.relativePath)
                if FileManager.default.fileExists(atPath: sourceURL.path) {
                    if let prevName = try? await MediaProcessor.shared.generatePreviewOnDemand(sourceURL: sourceURL, assetId: asset.id) {
                        try? await DatabaseManager.shared.updateAssetThumbnails(id: asset.id, thumbnailPath: asset.thumbnailPath, previewPath: prevName)
                        let fileURL = SystemPaths.previewsDirectory.appendingPathComponent(prevName)
                        if let data = try? Data(contentsOf: fileURL) {
                            return Response(
                                status: .ok,
                                headers: [
                                    .contentType: "image/jpeg",
                                    .cacheControl: "public, max-age=86400"
                                ],
                                body: .init(byteBuffer: ByteBuffer(data: data))
                            )
                        }
                    }
                }
            }

            return Response(status: .notFound)
        }

        // Reveal original in Finder (active ONLY if drive is connected)
        router.post("/api/v1/assets/:id/reveal") { _, context -> Response in
            guard let assetId = context.parameters.get("id"),
                  let asset = try await DatabaseManager.shared.getAsset(id: assetId),
                  let drive = try await DatabaseManager.shared.getDrive(id: asset.driveId) else {
                return Response(status: .notFound)
            }

            guard (drive.status == .connected || drive.status == .rebuilding), let mountPath = drive.mountPath else {
                let errData = try JSONSerialization.data(withJSONObject: [
                    "error": "Drive '\(drive.driveName)' is disconnected. Connect the drive to access the original file."
                ])
                return Response(status: .badRequest, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: errData)))
            }

            let fullPath = (mountPath as NSString).appendingPathComponent(asset.relativePath)
            guard FileManager.default.fileExists(atPath: fullPath) else {
                let errData = try JSONSerialization.data(withJSONObject: [
                    "error": "Original file not found at \(fullPath)"
                ])
                return Response(status: .notFound, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: errData)))
            }

            let fileURL = URL(fileURLWithPath: fullPath)
            DispatchQueue.main.async {
                NSWorkspace.shared.activateFileViewerSelecting([fileURL])
            }

            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"revealed\"}")))
        }

        // MARK: - Albums & Smart Collections
        router.get("/api/v1/albums") { _, _ -> Response in
            let albums = try await DatabaseManager.shared.getAllAlbums()
            let data = try JSONEncoder().encode(albums)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.post("/api/v1/albums") { request, _ -> Response in
            let buffer = try await request.body.collect(upTo: 1_000_000)
            let req = try JSONDecoder().decode(CreateAlbumRequest.self, from: Data(buffer.readableBytesView))

            let type = req.albumType ?? (req.rules != nil ? .smart : .manual)
            let album = AlbumRecord(name: req.name, description: req.description, albumType: type)
            try await DatabaseManager.shared.createAlbum(album, rules: req.rules)

            let data = try JSONEncoder().encode(album)
            return Response(status: .created, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.post("/api/v1/albums/auto-generate") { _, _ -> Response in
            let albums = try await DatabaseManager.shared.autoGenerateCollections()
            let data = try JSONEncoder().encode(albums)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.get("/api/v1/collections/meta") { _, _ -> Response in
            let meta = try await DatabaseManager.shared.getCollectionsMeta()
            let data = try JSONEncoder().encode(meta)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        // MARK: - Family Events (Birthdays & Anniversaries)
        router.get("/api/v1/family-events") { _, _ -> Response in
            let events = try await DatabaseManager.shared.getAllFamilyEvents()
            let data = try JSONEncoder().encode(events)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.post("/api/v1/family-events") { request, _ -> Response in
            let buffer = try await request.body.collect(upTo: 1_000_000)
            struct CreateEventPayload: Decodable {
                let id: String?
                let personName: String
                let eventType: FamilyEventType
                let eventDate: String
                let windowDays: Int?
                let notes: String?
            }
            let payload = try JSONDecoder().decode(CreateEventPayload.self, from: Data(buffer.readableBytesView))
            let event = FamilyEventRecord(
                id: payload.id ?? UUID().uuidString,
                personName: payload.personName,
                eventType: payload.eventType,
                eventDate: payload.eventDate,
                windowDays: payload.windowDays ?? 1,
                notes: payload.notes
            )
            try await DatabaseManager.shared.createFamilyEvent(event)
            _ = try? await DatabaseManager.shared.generateFamilyAlbums()
            let data = try JSONEncoder().encode(event)
            return Response(status: .created, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.delete("/api/v1/family-events/:id") { _, context -> Response in
            guard let eventId = context.parameters.get("id") else { return Response(status: .badRequest) }
            try await DatabaseManager.shared.deleteFamilyEvent(id: eventId)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"deleted\"}")))
        }

        router.post("/api/v1/family-events/sync") { _, _ -> Response in
            let albums = try await DatabaseManager.shared.generateFamilyAlbums()
            let data = try JSONEncoder().encode(albums)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(data: data)))
        }

        router.delete("/api/v1/albums/:id") { _, context -> Response in
            guard let albumId = context.parameters.get("id") else { return Response(status: .badRequest) }
            try await DatabaseManager.shared.deleteAlbum(id: albumId)
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"deleted\"}")))
        }

        router.post("/api/v1/albums/:id/assets") { request, context -> Response in
            guard let albumId = context.parameters.get("id") else { return Response(status: .badRequest) }
            let buffer = try await request.body.collect(upTo: 1_000_000)
            let req = try JSONDecoder().decode(AlbumAssetsRequest.self, from: Data(buffer.readableBytesView))

            for assetId in req.assetIds {
                try await DatabaseManager.shared.addAssetToAlbum(albumId: albumId, assetId: assetId)
            }
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"added\"}")))
        }

        router.delete("/api/v1/albums/:id/assets") { request, context -> Response in
            guard let albumId = context.parameters.get("id") else { return Response(status: .badRequest) }
            let buffer = try await request.body.collect(upTo: 1_000_000)
            let req = try JSONDecoder().decode(AlbumAssetsRequest.self, from: Data(buffer.readableBytesView))

            for assetId in req.assetIds {
                try await DatabaseManager.shared.removeAssetFromAlbum(albumId: albumId, assetId: assetId)
            }
            return Response(status: .ok, headers: [.contentType: "application/json"], body: .init(byteBuffer: ByteBuffer(string: "{\"status\":\"removed\"}")))
        }

        return router
    }
}

private func parseQueryParams(_ queryString: String) -> [String: String] {
    var params: [String: String] = [:]
    let pairs = queryString.split(separator: "&")
    for pair in pairs {
        let parts = pair.split(separator: "=", maxSplits: 1)
        if parts.count == 2 {
            let key = String(parts[0]).removingPercentEncoding ?? String(parts[0])
            let val = String(parts[1]).removingPercentEncoding ?? String(parts[1])
            params[key] = val
        }
    }
    return params
}
