import Foundation

public struct DirectoryItem: Codable, Sendable {
    public let name: String
    public let path: String
    public let isDirectory: Bool
    public let isVolume: Bool
    public let totalCapacity: Int64?
    public let availableCapacity: Int64?
    public let hasMediaToken: Bool
    public let subfolderCount: Int?

    public init(
        name: String,
        path: String,
        isDirectory: Bool,
        isVolume: Bool,
        totalCapacity: Int64? = nil,
        availableCapacity: Int64? = nil,
        hasMediaToken: Bool = false,
        subfolderCount: Int? = nil
    ) {
        self.name = name
        self.path = path
        self.isDirectory = isDirectory
        self.isVolume = isVolume
        self.totalCapacity = totalCapacity
        self.availableCapacity = availableCapacity
        self.hasMediaToken = hasMediaToken
        self.subfolderCount = subfolderCount
    }
}

public struct QuickLocation: Codable, Sendable {
    public let name: String
    public let path: String

    public init(name: String, path: String) {
        self.name = name
        self.path = path
    }
}

public struct BrowseDirectoryResponse: Codable, Sendable {
    public let currentPath: String
    public let parentPath: String?
    public let items: [DirectoryItem]
    public let quickLocations: [QuickLocation]

    public init(
        currentPath: String,
        parentPath: String?,
        items: [DirectoryItem],
        quickLocations: [QuickLocation]
    ) {
        self.currentPath = currentPath
        self.parentPath = parentPath
        self.items = items
        self.quickLocations = quickLocations
    }
}

public actor FileSystemManager {
    public static let shared = FileSystemManager()

    public init() {}

    public func getQuickLocations() -> [QuickLocation] {
        var locations: [QuickLocation] = [
            QuickLocation(name: "External Drives (/Volumes)", path: "/Volumes")
        ]
        let home = FileManager.default.homeDirectoryForCurrentUser
        locations.append(QuickLocation(name: "Home (~)", path: home.path))

        let pictures = home.appendingPathComponent("Pictures")
        if FileManager.default.fileExists(atPath: pictures.path) {
            locations.append(QuickLocation(name: "Pictures", path: pictures.path))
        }

        let movies = home.appendingPathComponent("Movies")
        if FileManager.default.fileExists(atPath: movies.path) {
            locations.append(QuickLocation(name: "Movies", path: movies.path))
        }

        let downloads = home.appendingPathComponent("Downloads")
        if FileManager.default.fileExists(atPath: downloads.path) {
            locations.append(QuickLocation(name: "Downloads", path: downloads.path))
        }

        return locations
    }

    public func browse(path rawPath: String?) throws -> BrowseDirectoryResponse {
        let fileManager = FileManager.default
        let targetPath: String

        if let raw = rawPath?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            targetPath = (raw as NSString).expandingTildeInPath
        } else {
            targetPath = "/Volumes"
        }

        let targetURL = URL(fileURLWithPath: targetPath, isDirectory: true).standardizedFileURL

        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: targetURL.path, isDirectory: &isDir), isDir.boolValue else {
            throw NSError(domain: "FileSystemManager", code: 404, userInfo: [
                NSLocalizedDescriptionKey: "Directory not found at '\(targetPath)'"
            ])
        }

        let isVolumesRoot = (targetURL.path == "/Volumes" || targetURL.path == "/Volumes/")
        let parentPath: String? = (isVolumesRoot || targetURL.path == "/") ? nil : targetURL.deletingLastPathComponent().path

        let contents = (try? fileManager.contentsOfDirectory(
            at: targetURL,
            includingPropertiesForKeys: [.isDirectoryKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey],
            options: [.skipsHiddenFiles]
        )) ?? []

        var items: [DirectoryItem] = []

        // System directories to ignore
        let ignoredNames: Set<String> = [
            "$RECYCLE.BIN", "System Volume Information", ".Spotlight-V100", ".Trashes", ".fseventsd"
        ]

        for itemURL in contents {
            let itemName = itemURL.lastPathComponent
            if itemName.hasPrefix(".") || ignoredNames.contains(itemName) {
                continue
            }

            var itemIsDir: ObjCBool = false
            guard fileManager.fileExists(atPath: itemURL.path, isDirectory: &itemIsDir), itemIsDir.boolValue else {
                continue
            }

            let isVolume = isVolumesRoot
            var totalCap: Int64? = nil
            var availCap: Int64? = nil

            if isVolume {
                if let res = try? itemURL.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityKey]) {
                    totalCap = Int64(res.volumeTotalCapacity ?? 0)
                    availCap = Int64(res.volumeAvailableCapacity ?? 0)
                }
            }

            // Check if directory has .media-manager/drive.json
            let tokenURL = itemURL.appendingPathComponent(".media-manager/drive.json")
            let hasToken = fileManager.fileExists(atPath: tokenURL.path)

            items.append(DirectoryItem(
                name: itemName,
                path: itemURL.path,
                isDirectory: true,
                isVolume: isVolume,
                totalCapacity: totalCap,
                availableCapacity: availCap,
                hasMediaToken: hasToken,
                subfolderCount: nil
            ))
        }

        // Sort items: volumes/folders alphabetically
        items.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }

        return BrowseDirectoryResponse(
            currentPath: targetURL.path,
            parentPath: parentPath,
            items: items,
            quickLocations: getQuickLocations()
        )
    }

    public func pickFolderWithNativeDialog() async -> String? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
                process.arguments = [
                    "-e",
                    """
                    try
                        tell application "System Events" to activate
                        set f to POSIX path of (choose folder with prompt "Select External Hard Drive or Media Directory" default location (POSIX file "/Volumes"))
                        return f
                    on error
                        return ""
                    end try
                    """
                ]
                let pipe = Pipe()
                process.standardOutput = pipe
                process.standardError = Pipe()

                do {
                    try process.run()
                    process.waitUntilExit()
                    let data = pipe.fileHandleForReading.readDataToEndOfFile()
                    var output = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
                    while output.count > 1 && output.hasSuffix("/") {
                        output.removeLast()
                    }
                    if output.isEmpty || output == "cancelled" {
                        continuation.resume(returning: nil)
                    } else {
                        continuation.resume(returning: output)
                    }
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
