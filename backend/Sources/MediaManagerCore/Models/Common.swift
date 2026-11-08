import Foundation

public struct SystemPaths: Sendable {
    public static var appSupportDirectory: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("MediaManager", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var databaseDirectory: URL {
        let dir = appSupportDirectory.appendingPathComponent("database", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var databaseURL: URL {
        return databaseDirectory.appendingPathComponent("library.sqlite")
    }

    public static var drivesRegistryDirectory: URL {
        let dir = appSupportDirectory.appendingPathComponent("drives", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static func localRegistryURL(for driveId: String) -> URL {
        return drivesRegistryDirectory.appendingPathComponent("\(driveId).json")
    }

    public static var thumbnailsDirectory: URL {
        let dir = appSupportDirectory.appendingPathComponent("thumbnails", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    public static var previewsDirectory: URL {
        let dir = appSupportDirectory.appendingPathComponent("previews", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}
