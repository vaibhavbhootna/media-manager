import Foundation

public struct DriveToken: Codable, Sendable {
    public let application: String
    public let schemaVersion: Int
    public let driveId: String
    public let driveName: String
    public let createdAt: String

    public init(driveId: String, driveName: String, createdAt: String = ISO8601DateFormatter().string(from: Date())) {
        self.application = "MediaManager"
        self.schemaVersion = 1
        self.driveId = driveId
        self.driveName = driveName
        self.createdAt = createdAt
    }
}

public enum DriveStatus: String, Codable, Sendable {
    case connected
    case disconnected
    case conflict_detected
    case rebuilding
}

public struct DriveRecord: Codable, Sendable, Identifiable {
    public let id: String
    public var driveName: String
    public var volumeUuid: String?
    public var mountPath: String?
    public var filesystemType: String?
    public var totalCapacity: Int64
    public var availableCapacity: Int64
    public var status: DriveStatus
    public var lastConnected: String
    public var createdAt: String
    public var assetCount: Int?

    public init(
        id: String,
        driveName: String,
        volumeUuid: String? = nil,
        mountPath: String? = nil,
        filesystemType: String? = nil,
        totalCapacity: Int64 = 0,
        availableCapacity: Int64 = 0,
        status: DriveStatus = .connected,
        lastConnected: String = ISO8601DateFormatter().string(from: Date()),
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        assetCount: Int? = 0
    ) {
        self.id = id
        self.driveName = driveName
        self.volumeUuid = volumeUuid
        self.mountPath = mountPath
        self.filesystemType = filesystemType
        self.totalCapacity = totalCapacity
        self.availableCapacity = availableCapacity
        self.status = status
        self.lastConnected = lastConnected
        self.createdAt = createdAt
        self.assetCount = assetCount
    }
}
