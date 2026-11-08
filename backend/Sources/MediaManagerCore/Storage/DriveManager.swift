import Foundation

public actor DriveManager {
    public static let shared = DriveManager()

    private let db = DatabaseManager.shared
    private let processor = MediaProcessor.shared
    private var activeRebuilds = Set<String>()

    public init() {}

    public func isRebuilding(driveId: String) -> Bool {
        return activeRebuilds.contains(driveId)
    }

    // MARK: - Registration

    public func sanitizePath(_ raw: String) -> String {
        var path = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let quoteChars: Set<Character> = ["\"", "'", "`"]
        var changed = true
        while changed && !path.isEmpty {
            changed = false
            if let first = path.first, quoteChars.contains(first) || first == "\\" {
                path.removeFirst()
                changed = true
            }
            if let last = path.last, quoteChars.contains(last) || last == "\\" {
                path.removeLast()
                changed = true
            }
        }
        path = path.trimmingCharacters(in: .whitespacesAndNewlines)
        path = path.replacingOccurrences(of: "\\ ", with: " ")
        while path.count > 1 && path.hasSuffix("/") {
            path.removeLast()
        }
        return path
    }

    public func registerDrive(mountPath: String, customName: String? = nil) async throws -> DriveRecord {
        let cleanPath = sanitizePath(mountPath)

        let driveRootURL = URL(fileURLWithPath: cleanPath, isDirectory: true).standardizedFileURL
        guard FileManager.default.fileExists(atPath: driveRootURL.path) else {
            throw NSError(domain: "DriveManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Directory does not exist at '\(cleanPath)'"])
        }

        let mediaManagerDir = driveRootURL.appendingPathComponent(".media-manager", isDirectory: true)
        let tokenFileURL = mediaManagerDir.appendingPathComponent("drive.json")
        let tmpDir = mediaManagerDir.appendingPathComponent("tmp", isDirectory: true)

        do {
            try FileManager.default.createDirectory(at: mediaManagerDir, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        } catch {
            let nsErr = error as NSError
            if nsErr.code == 513 || nsErr.code == 1 {
                throw NSError(domain: "DriveManager", code: 403, userInfo: [
                    NSLocalizedDescriptionKey: "macOS Permission Denied for '\(cleanPath)'. Please grant 'Removable Volumes' or 'Full Disk Access' permission in macOS System Settings > Privacy & Security > Files and Folders."
                ])
            }
            throw error
        }

        let driveId: String
        let driveName: String
        let createdAt: String

        if FileManager.default.fileExists(atPath: tokenFileURL.path),
           let data = try? Data(contentsOf: tokenFileURL),
           let existingToken = try? JSONDecoder().decode(DriveToken.self, from: data) {
            // Re-registering or restoring an already tokenized drive
            driveId = existingToken.driveId
            driveName = customName ?? existingToken.driveName
            createdAt = existingToken.createdAt
        } else {
            // Brand new drive registration
            driveId = UUID().uuidString.lowercased()
            driveName = customName ?? driveRootURL.lastPathComponent
            createdAt = ISO8601DateFormatter().string(from: Date())

            let token = DriveToken(driveId: driveId, driveName: driveName, createdAt: createdAt)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(token)
            do {
                try data.write(to: tokenFileURL, options: .atomic)
            } catch {
                let nsErr = error as NSError
                if nsErr.code == 513 || nsErr.code == 1 {
                    throw NSError(domain: "DriveManager", code: 403, userInfo: [
                        NSLocalizedDescriptionKey: "macOS Permission Denied: Cannot write token to '\(tokenFileURL.path)'. Please grant 'Removable Volumes' permission in macOS System Settings > Privacy & Security > Files and Folders."
                    ])
                }
                throw error
            }
        }

        // Get volume storage attributes
        var totalCap: Int64 = 0
        var availCap: Int64 = 0
        var volUuid: String? = nil
        var fsType: String? = nil

        if let res = try? driveRootURL.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeUUIDStringKey, .volumeLocalizedFormatDescriptionKey]) {
            totalCap = Int64(res.volumeTotalCapacity ?? 0)
            availCap = Int64(res.volumeAvailableCapacity ?? 0)
            volUuid = res.volumeUUIDString
            fsType = res.volumeLocalizedFormatDescription
        }

        let record = DriveRecord(
            id: driveId,
            driveName: driveName,
            volumeUuid: volUuid,
            mountPath: driveRootURL.path,
            filesystemType: fsType,
            totalCapacity: totalCap,
            availableCapacity: availCap,
            status: .connected,
            lastConnected: ISO8601DateFormatter().string(from: Date()),
            createdAt: createdAt,
            assetCount: 0
        )

        // Save local registry JSON
        let registryURL = SystemPaths.drivesRegistryDirectory.appendingPathComponent("\(driveId).json")
        let regData = try JSONEncoder().encode(record)
        try regData.write(to: registryURL, options: .atomic)

        // Save in DB
        try await db.upsertDrive(record)

        return record
    }

    public func unregisterDrive(driveId: String) async throws {
        // 1. Remove local registry file
        let registryURL = SystemPaths.localRegistryURL(for: driveId)
        try? FileManager.default.removeItem(at: registryURL)

        // 2. Remove from SQLite database
        try await db.deleteDrive(id: driveId)

        // 3. Broadcast WebSocket event
        await WebSocketHub.shared.broadcast(event: "drive.unregistered", data: ["driveId": driveId])
    }

    // MARK: - Drive Verification & Conflict Detection

    public func syncMountedVolumes() async throws -> [DriveRecord] {
        let fileManager = FileManager.default
        let volumesURL = URL(fileURLWithPath: "/Volumes", isDirectory: true)
        let mountedURLs = (try? fileManager.contentsOfDirectory(at: volumesURL, includingPropertiesForKeys: nil, options: .skipsHiddenFiles)) ?? []

        let registeredDrives = try await db.getAllDrives()
        var detectedTokensByDriveId: [String: [URL]] = [:]

        // 1. Scan volume roots in /Volumes
        for url in mountedURLs {
            let tokenURL = url.appendingPathComponent(".media-manager/drive.json")
            if fileManager.fileExists(atPath: tokenURL.path),
               let data = try? Data(contentsOf: tokenURL),
               let token = try? JSONDecoder().decode(DriveToken.self, from: data) {
                detectedTokensByDriveId[token.driveId, default: []].append(url)
            }
        }

        // 2. Scan registered archive subpaths for all known drives
        for drive in registeredDrives {
            var candidatePaths: [String] = []
            if let mp = drive.mountPath, !mp.isEmpty {
                candidatePaths.append(mp)
            }
            let regURL = SystemPaths.localRegistryURL(for: drive.id)
            if let data = try? Data(contentsOf: regURL),
               let reg = try? JSONDecoder().decode(DriveRecord.self, from: data),
               let regMp = reg.mountPath, !candidatePaths.contains(regMp) {
                candidatePaths.append(regMp)
            }

            for path in candidatePaths {
                let candidateURL = URL(fileURLWithPath: path, isDirectory: true)
                let tokenURL = candidateURL.appendingPathComponent(".media-manager/drive.json")
                if fileManager.fileExists(atPath: tokenURL.path),
                   let data = try? Data(contentsOf: tokenURL),
                   let token = try? JSONDecoder().decode(DriveToken.self, from: data) {
                    if !(detectedTokensByDriveId[token.driveId]?.contains(candidateURL) ?? false) {
                        detectedTokensByDriveId[token.driveId, default: []].append(candidateURL)
                    }
                }
            }
        }

        // 3. Update status in DB
        for drive in registeredDrives {
            if let urls = detectedTokensByDriveId[drive.id], !urls.isEmpty {
                if urls.count > 1 {
                    // Clone conflict detected! Multiple mounted locations share the same driveId
                    try await db.updateDriveStatus(id: drive.id, status: .conflict_detected, mountPath: nil)
                } else if let singleURL = urls.first {
                    // Drive is healthy and connected at this mount path
                    try await db.updateDriveStatus(id: drive.id, status: .connected, mountPath: singleURL.path)
                }
            } else {
                // Check if directory exists at saved mountPath (even if token read failed temporarily)
                var fallbackPath: String? = drive.mountPath
                if fallbackPath == nil || fallbackPath?.isEmpty == true {
                    let regURL = SystemPaths.localRegistryURL(for: drive.id)
                    if let data = try? Data(contentsOf: regURL),
                       let reg = try? JSONDecoder().decode(DriveRecord.self, from: data) {
                        fallbackPath = reg.mountPath
                    }
                }

                if let fp = fallbackPath, fileManager.fileExists(atPath: fp) {
                    try await db.updateDriveStatus(id: drive.id, status: .connected, mountPath: fp)
                } else {
                    // Drive not currently mounted
                    try await db.updateDriveStatus(id: drive.id, status: .disconnected, mountPath: nil)
                }
            }
        }

        return try await db.getAllDrives()
    }

    // MARK: - Catalog Rebuilding (Foundation)

    public func rebuildCatalog(
        driveId: String,
        onProgress: (@Sendable (Int, Int, String) -> Void)? = nil
    ) async throws -> (scanned: Int, added: Int, updated: Int, pruned: Int) {
        guard !activeRebuilds.contains(driveId) else {
            throw NSError(domain: "DriveManager", code: 409, userInfo: [NSLocalizedDescriptionKey: "Rebuild is already in progress for this drive."])
        }
        activeRebuilds.insert(driveId)
        defer {
            activeRebuilds.remove(driveId)
        }

        guard let drive = try await db.getDrive(id: driveId) else {
            throw NSError(domain: "DriveManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Drive not found in catalog."])
        }

        var effectiveMountPath = drive.mountPath
        if effectiveMountPath == nil || effectiveMountPath?.isEmpty == true {
            let regURL = SystemPaths.localRegistryURL(for: driveId)
            if let data = try? Data(contentsOf: regURL),
               let reg = try? JSONDecoder().decode(DriveRecord.self, from: data) {
                effectiveMountPath = reg.mountPath
            }
        }

        guard let mountPath = effectiveMountPath,
              FileManager.default.fileExists(atPath: mountPath) else {
            throw NSError(domain: "DriveManager", code: 400, userInfo: [NSLocalizedDescriptionKey: "Drive is not connected or mount path is invalid."])
        }

        try await db.updateDriveStatus(id: driveId, status: .rebuilding, mountPath: mountPath)

        // Initial progress notification
        onProgress?(0, 0, "Discovering media files on drive...")

        // Clean up any historical duplicate entries before scan
        _ = try? await db.removeDuplicateAssets(driveId: driveId)

        let rootURL = URL(fileURLWithPath: mountPath, isDirectory: true)
        let fileManager = FileManager.default

        // Verify read permissions before scanning
        do {
            _ = try fileManager.contentsOfDirectory(atPath: rootURL.path)
        } catch {
            let nsErr = error as NSError
            if nsErr.code == 513 || nsErr.code == 1 || nsErr.code == 257 || nsErr.domain == NSCocoaErrorDomain {
                throw NSError(domain: "DriveManager", code: 403, userInfo: [
                    NSLocalizedDescriptionKey: "macOS Permission Denied: Unable to read '\(rootURL.path)'. macOS requires Removable Volumes or Full Disk Access permission for this drive. Please start the backend from macOS Terminal.app or grant 'Removable Volumes' in System Settings > Privacy & Security > Files and Folders."
                ])
            }
            throw error
        }

        // Enumerate media files
        let mediaExtensions: Set<String> = [
            "heic", "jpg", "jpeg", "png", "gif", "tiff", "tif", "dng", "raw", "cr2", "nef", "arw",
            "mov", "mp4", "m4v", "avi", "mkv", "heif", "webp"
        ]

        var candidateURLs: [URL] = []
        if let enumerator = fileManager.enumerator(
            at: rootURL,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey],
            options: [.skipsPackageDescendants]
        ) {
            while let fileURL = enumerator.nextObject() as? URL {
                let filename = fileURL.lastPathComponent
                // Skip hidden folders & hidden files (.media-manager, .DS_Store, ._*)
                if filename.hasPrefix(".") {
                    if (try? fileURL.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
                        enumerator.skipDescendants()
                    }
                    continue
                }

                let ext = fileURL.pathExtension.lowercased()
                if mediaExtensions.contains(ext) {
                    candidateURLs.append(fileURL)
                }
            }
        }

        let total = candidateURLs.count
        var scanned = 0
        var added = 0
        var updated = 0
        var seenRelativePaths = Set<String>()

        onProgress?(0, total, total > 0 ? "Found \(total) media files. Reading metadata..." : "No media files found.")

        for (index, fileURL) in candidateURLs.enumerated() {
            scanned += 1
            let filename = fileURL.lastPathComponent

            // Robust relative path calculation that seamlessly handles spaces and subdirectories
            let standardizedRoot = rootURL.resolvingSymlinksInPath()
            let standardizedFile = fileURL.resolvingSymlinksInPath()
            let rootComponents = standardizedRoot.pathComponents
            let fileComponents = standardizedFile.pathComponents
            let relativePath: String
            if fileComponents.starts(with: rootComponents) {
                let rel = fileComponents.dropFirst(rootComponents.count)
                relativePath = rel.joined(separator: "/")
            } else {
                relativePath = fileURL.lastPathComponent
            }
            seenRelativePaths.insert(relativePath)
            let attrs = try? fileManager.attributesOfItem(atPath: fileURL.path)
            let fileSize = (attrs?[.size] as? Int64) ?? 0

            // Check if existing asset
            let existing = try await db.findAssetByRelativePath(driveId: driveId, relativePath: relativePath)
            let assetId = existing?.id ?? UUID().uuidString.lowercased()

            // Extract metadata
            let meta = await processor.extractMetadata(fileURL: fileURL)

            // Generate thumbnails if missing
            var thumbPath = existing?.thumbnailPath
            var prevPath = existing?.previewPath

            let thumbFileExists = thumbPath != nil && fileManager.fileExists(atPath: SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbPath!).path)

            if !thumbFileExists {
                if let thumbs = try? await processor.generateThumbnailAndPreview(sourceURL: fileURL, assetId: assetId) {
                    thumbPath = thumbs.thumbnailPath
                    prevPath = thumbs.previewPath
                }
            }

            var city: String? = existing?.city
            var state: String? = existing?.state
            var country: String? = existing?.country
            var placeName: String? = existing?.placeName

            if (city == nil || country == nil), let lat = meta.latitude, let lon = meta.longitude {
                if let cached = try? await db.getCachedGeo(latitude: lat, longitude: lon) {
                    city = cached.city
                    state = cached.state
                    country = cached.country
                    placeName = cached.placeName
                } else if let resolved = await GeoService.shared.reverseGeocode(latitude: lat, longitude: lon) {
                    city = resolved.city
                    state = resolved.state
                    country = resolved.country
                    placeName = resolved.placeName
                    try? await db.saveCachedGeo(latitude: lat, longitude: lon, city: city, state: state, country: country, placeName: placeName)
                }
            }

            let record = AssetRecord(
                id: assetId,
                driveId: driveId,
                driveName: drive.driveName,
                originalFilename: filename,
                relativePath: relativePath,
                fileExtension: fileURL.pathExtension,
                mediaType: meta.mediaType,
                mimeType: meta.mimeType,
                fileSize: fileSize,
                checksum: nil,
                dateTaken: meta.dateTaken,
                dateImported: existing?.dateImported ?? ISO8601DateFormatter().string(from: Date()),
                modifiedAt: (attrs?[.modificationDate] as? Date).map { ISO8601DateFormatter().string(from: $0) },
                width: meta.width,
                height: meta.height,
                duration: meta.duration,
                latitude: meta.latitude,
                longitude: meta.longitude,
                altitude: meta.altitude,
                cameraMake: meta.cameraMake,
                cameraModel: meta.cameraModel,
                lensModel: meta.lensModel,
                iso: meta.iso,
                focalLength: meta.focalLength,
                aperture: meta.aperture,
                shutterSpeed: meta.shutterSpeed,
                isFavorite: existing?.isFavorite ?? false,
                thumbnailPath: thumbPath,
                previewPath: prevPath,
                availabilityStatus: .available,
                city: city,
                state: state,
                country: country,
                placeName: placeName
            )

            try await db.upsertAsset(record)
            if existing != nil {
                updated += 1
            } else {
                added += 1
            }

            if index == 0 || index % 5 == 0 || index == total - 1 {
                onProgress?(index + 1, total, filename)
            }
        }

        // Prune missing files that have been deleted or moved from HDD
        onProgress?(total, total, "Checking for deleted or removed files...")
        let pruned = (try? await db.pruneMissingAssets(driveId: driveId, validRelativePaths: seenRelativePaths)) ?? 0
        if pruned > 0 {
            onProgress?(total, total, "Cleaned up \(pruned) deleted items from catalog.")
        }

        // Restore status to connected
        try await db.updateDriveStatus(id: driveId, status: .connected, mountPath: mountPath)

        // Write portable catalog manifest to HDD (.media-manager/manifest.json)
        try? await writeManifestToDrive(driveId: driveId, mountPath: mountPath)

        return (scanned, added, updated, pruned)
    }

    private func writeManifestToDrive(driveId: String, mountPath: String) async throws {
        let manifestURL = URL(fileURLWithPath: mountPath).appendingPathComponent(".media-manager/manifest.json")
        let (assets, _) = try await db.queryAssets(filter: AssetQueryFilter(driveId: driveId, limit: 1_000_000))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let data = try encoder.encode(assets)
        try data.write(to: manifestURL, options: .atomic)
    }
}
