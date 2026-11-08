import Foundation

public struct ConnectedIOSDevice: Codable, Sendable {
    public let udid: String
    public let name: String
    public let model: String
    public let productType: String
    public let iosVersion: String
    public let isTrusted: Bool
    public let batteryLevel: Int?

    public init(
        udid: String,
        name: String,
        model: String,
        productType: String,
        iosVersion: String,
        isTrusted: Bool,
        batteryLevel: Int? = nil
    ) {
        self.udid = udid
        self.name = name
        self.model = model
        self.productType = productType
        self.iosVersion = iosVersion
        self.isTrusted = isTrusted
        self.batteryLevel = batteryLevel
    }
}

public struct BackupSessionStatus: Codable, Sendable {
    public var status: String // "idle", "running", "completed", "failed"
    public var targetDriveId: String?
    public var targetDriveName: String?
    public var currentStep: String?
    public var currentFile: String?
    public var progressPercent: Int
    public var logs: [String]
    public var error: String?

    public init(
        status: String = "idle",
        targetDriveId: String? = nil,
        targetDriveName: String? = nil,
        currentStep: String? = nil,
        currentFile: String? = nil,
        progressPercent: Int = 0,
        logs: [String] = [],
        error: String? = nil
    ) {
        self.status = status
        self.targetDriveId = targetDriveId
        self.targetDriveName = targetDriveName
        self.currentStep = currentStep
        self.currentFile = currentFile
        self.progressPercent = progressPercent
        self.logs = logs
        self.error = error
    }
}

public actor IOSDeviceManager {
    public static let shared = IOSDeviceManager()

    private var activeStatus = BackupSessionStatus()
    private var activeTask: Task<Void, Never>?

    private let scriptsDir: URL

    public init() {
        // Locate iphone-auto-backup script directory
        let home = FileManager.default.homeDirectoryForCurrentUser
        let candidate = home.appendingPathComponent("dev/iphone-auto-backup")
        if FileManager.default.fileExists(atPath: candidate.path) {
            self.scriptsDir = candidate
        } else {
            self.scriptsDir = URL(fileURLWithPath: "/Users/gunjan/dev/iphone-auto-backup")
        }
    }

    // MARK: - Tool Resolution

    private func resolveTool(_ name: String) -> String {
        let brewArm = "/opt/homebrew/bin/\(name)"
        if FileManager.default.fileExists(atPath: brewArm) { return brewArm }
        let brewIntel = "/usr/local/bin/\(name)"
        if FileManager.default.fileExists(atPath: brewIntel) { return brewIntel }
        return name
    }

    // MARK: - Model Mapping Helper

    private func friendlyModelName(productType: String) -> String {
        let mapping: [String: String] = [
            "iPhone16,1": "iPhone 15 Pro",
            "iPhone16,2": "iPhone 15 Pro Max",
            "iPhone15,4": "iPhone 15",
            "iPhone15,5": "iPhone 15 Plus",
            "iPhone15,2": "iPhone 14 Pro",
            "iPhone15,3": "iPhone 14 Pro Max",
            "iPhone14,7": "iPhone 14",
            "iPhone14,8": "iPhone 14 Plus",
            "iPhone14,2": "iPhone 13 Pro",
            "iPhone14,3": "iPhone 13 Pro Max",
            "iPhone14,5": "iPhone 13",
            "iPhone14,4": "iPhone 13 mini",
            "iPhone13,2": "iPhone 12",
            "iPhone13,1": "iPhone 12 mini",
            "iPhone13,3": "iPhone 12 Pro",
            "iPhone13,4": "iPhone 12 Pro Max",
            "iPhone12,1": "iPhone 11",
            "iPhone12,3": "iPhone 11 Pro",
            "iPhone12,5": "iPhone 11 Pro Max",
            "iPhone11,8": "iPhone XR",
            "iPhone11,2": "iPhone XS",
            "iPhone11,4": "iPhone XS Max",
            "iPhone11,6": "iPhone XS Max",
            "iPhone10,3": "iPhone X",
            "iPhone10,6": "iPhone X",
            "iPhone14,6": "iPhone SE (3rd Gen)",
            "iPhone12,8": "iPhone SE (2nd Gen)"
        ]
        return mapping[productType] ?? productType
    }

    // MARK: - Device Discovery

    public func getConnectedDevices() async -> [ConnectedIOSDevice] {
        let ideviceId = resolveTool("idevice_id")
        let ideviceinfo = resolveTool("ideviceinfo")
        let idevicepair = resolveTool("idevicepair")

        let idOutput = runProcess(executable: ideviceId, arguments: ["-l"])
        let udids = idOutput
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var devices: [ConnectedIOSDevice] = []

        for udid in udids {
            // Check pairing trust
            let pairOutput = runProcess(executable: idevicepair, arguments: ["-u", udid, "validate"])
            let isTrusted = pairOutput.contains("SUCCESS")

            let devName = runProcess(executable: ideviceinfo, arguments: ["-u", udid, "-k", "DeviceName"])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let prodType = runProcess(executable: ideviceinfo, arguments: ["-u", udid, "-k", "ProductType"])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let iosVer = runProcess(executable: ideviceinfo, arguments: ["-u", udid, "-k", "ProductVersion"])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let battRaw = runProcess(executable: ideviceinfo, arguments: ["-u", udid, "-q", "com.apple.mobile.battery", "-k", "BatteryCurrentCapacity"])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let batt = Int(battRaw)

            let modelName = friendlyModelName(productType: prodType.isEmpty ? "iPhone" : prodType)
            let cleanName = devName.isEmpty ? modelName : devName

            devices.append(ConnectedIOSDevice(
                udid: udid,
                name: cleanName,
                model: modelName,
                productType: prodType,
                iosVersion: iosVer.isEmpty ? "iOS" : "iOS \(iosVer)",
                isTrusted: isTrusted,
                batteryLevel: batt
            ))
        }

        return devices
    }

    // MARK: - Backup Execution

    public func getBackupStatus() -> BackupSessionStatus {
        return activeStatus
    }

    public func startBackup(driveId: String, mediaType: String = "all") async throws -> BackupSessionStatus {
        if activeStatus.status == "running" {
            throw NSError(domain: "IOSDeviceManager", code: 409, userInfo: [
                NSLocalizedDescriptionKey: "An iPhone backup session is already in progress."
            ])
        }

        // Validate drive
        guard let drive = try await DatabaseManager.shared.getDrive(id: driveId) else {
            throw NSError(domain: "IOSDeviceManager", code: 404, userInfo: [
                NSLocalizedDescriptionKey: "Target external drive not found in registry."
            ])
        }

        guard drive.status == .connected, let mountPath = drive.mountPath else {
            throw NSError(domain: "IOSDeviceManager", code: 400, userInfo: [
                NSLocalizedDescriptionKey: "Drive '\(drive.driveName)' is disconnected. Connect the drive first."
            ])
        }

        let devices = await getConnectedDevices()
        guard let firstDevice = devices.first else {
            throw NSError(domain: "IOSDeviceManager", code: 404, userInfo: [
                NSLocalizedDescriptionKey: "No iPhone connected via USB. Unlock your phone and connect via cable."
            ])
        }

        if !firstDevice.isTrusted {
            throw NSError(domain: "IOSDeviceManager", code: 403, userInfo: [
                NSLocalizedDescriptionKey: "iPhone '\(firstDevice.name)' is untrusted. Unlock phone and tap 'Trust This Computer'."
            ])
        }

        activeStatus = BackupSessionStatus(
            status: "running",
            targetDriveId: driveId,
            targetDriveName: drive.driveName,
            currentStep: "Starting backup from \(firstDevice.name)...",
            currentFile: nil,
            progressPercent: 5,
            logs: ["Connecting to \(firstDevice.name) (\(firstDevice.model))...", "Destination Drive: \(drive.driveName) (\(mountPath))"]
        )

        await WebSocketHub.shared.broadcast(event: "iphone.backup.started", data: [
            "driveId": driveId,
            "driveName": drive.driveName,
            "device": firstDevice.name
        ])

        // Launch background task
        activeTask = Task.detached { [weak self] in
            guard let self = self else { return }
            await self.executeBackupPipeline(mountPath: mountPath, driveId: driveId, deviceName: firstDevice.name, mediaType: mediaType)
        }

        return activeStatus
    }

    private func executeBackupPipeline(mountPath: String, driveId: String, deviceName: String, mediaType: String) async {
        let cleanMount = mountPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let videoTarget: String
        let photoTarget: String

        if cleanMount.hasSuffix("/iPhone_Videos") {
            videoTarget = cleanMount
            let parent = URL(fileURLWithPath: cleanMount).deletingLastPathComponent().path
            photoTarget = "\(parent)/iPhone_Photos"
        } else if cleanMount.hasSuffix("/iPhone_Photos") {
            photoTarget = cleanMount
            let parent = URL(fileURLWithPath: cleanMount).deletingLastPathComponent().path
            videoTarget = "\(parent)/iPhone_Videos"
        } else {
            videoTarget = "\(cleanMount)/iPhone_Videos"
            photoTarget = "\(cleanMount)/iPhone_Photos"
        }

        var env = ProcessInfo.processInfo.environment
        env["BACKUP_ROOT"] = videoTarget
        env["PHOTO_BACKUP_ROOT"] = photoTarget
        env["AUTO_REFRESH_INDEX"] = "0"
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

        let _ = true

        // 1. Run video backup
        if mediaType == "all" || mediaType == "videos" {
            await appendLog("▶ Step 1/3: Backing up Videos to \(videoTarget)...")
            await updateStep("Backing up Videos...", percent: 20)
            let videoScript = scriptsDir.appendingPathComponent("backup_videos_v3.sh").path

            let vidOk = await runStreamingProcess(scriptPath: videoScript, env: env)
            if !vidOk {
                await appendLog("⚠️ Video backup encountered warnings or skips.")
            }
        }

        // 2. Run photo backup
        if mediaType == "all" || mediaType == "photos" {
            await appendLog("▶ Step 2/3: Backing up Photos to \(photoTarget)...")
            await updateStep("Backing up Photos...", percent: 50)
            let photoScript = scriptsDir.appendingPathComponent("backup_photos_v3.sh").path

            let phoOk = await runStreamingProcess(scriptPath: photoScript, env: env)
            if !phoOk {
                await appendLog("⚠️ Photo backup encountered warnings or skips.")
            }
        }

        // 3. Trigger Media Manager Fast SSD Indexing
        await appendLog("▶ Step 3/3: Indexing new media in Media Manager (generating fast SSD previews)...")
        await updateStep("Generating fast SSD previews & thumbnails...", percent: 85)

        do {
            let scanResult = try await DriveManager.shared.rebuildCatalog(driveId: driveId) { current, total, filename in
                Task { [weak self] in
                    guard let self = self else { return }
                    let pct = 85 + Int(Double(current) / Double(max(total, 1)) * 14.0)
                    await self.updateProgress(current: current, total: total, file: filename, percent: pct)
                }
            }
            await appendLog("✓ Media Manager index updated: \(scanResult.added) new items added, \(scanResult.scanned) items cataloged.")
        } catch {
            await appendLog("⚠️ Media Manager index warning: \(error.localizedDescription)")
        }

        // Complete
        await updateStep("Backup and indexing complete!", percent: 100)
        activeStatus.status = "completed"

        await WebSocketHub.shared.broadcast(event: "iphone.backup.completed", data: [
            "driveId": driveId,
            "device": deviceName,
            "logs": activeStatus.logs.suffix(10).joined(separator: "\n")
        ])
    }

    private func appendLog(_ message: String) async {
        activeStatus.logs.append("[\(currentTimeString())] \(message)")
        if activeStatus.logs.count > 200 {
            activeStatus.logs.removeFirst(activeStatus.logs.count - 200)
        }
        await WebSocketHub.shared.broadcast(event: "iphone.backup.log", data: ["line": message])
    }

    private func updateStep(_ step: String, percent: Int) async {
        activeStatus.currentStep = step
        activeStatus.progressPercent = percent
        await WebSocketHub.shared.broadcast(event: "iphone.backup.progress", data: [
            "step": step,
            "percent": percent
        ])
    }

    private func updateProgress(current: Int, total: Int, file: String, percent: Int) async {
        activeStatus.currentFile = file
        activeStatus.progressPercent = percent
        await WebSocketHub.shared.broadcast(event: "iphone.backup.progress", data: [
            "current": current,
            "total": total,
            "file": file,
            "percent": percent
        ])
    }

    private func currentTimeString() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: Date())
    }

    // MARK: - Process Execution

    private func runProcess(executable: String, arguments: [String]) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return ""
        }
    }

    private func runStreamingProcess(scriptPath: String, env: [String: String]) async -> Bool {
        guard FileManager.default.fileExists(atPath: scriptPath) else {
            await appendLog("Error: Script not found at \(scriptPath)")
            return false
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [scriptPath]
        process.environment = env

        let stdoutPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stdoutPipe

        let fileHandle = stdoutPipe.fileHandleForReading

        do {
            try process.run()
        } catch {
            await appendLog("Failed to execute \(scriptPath): \(error.localizedDescription)")
            return false
        }

        // Stream output
        let stream = AsyncStream<String> { continuation in
            fileHandle.readabilityHandler = { handle in
                let data = handle.availableData
                if data.isEmpty {
                    continuation.finish()
                    fileHandle.readabilityHandler = nil
                } else if let line = String(data: data, encoding: .utf8) {
                    continuation.yield(line)
                }
            }
        }

        for await text in stream {
            let lines = text.components(separatedBy: .newlines).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            for line in lines {
                await appendLog(line)
            }
        }

        process.waitUntilExit()
        return process.terminationStatus == 0
    }
}
