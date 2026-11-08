import Foundation

public enum MediaType: String, Codable, Sendable {
    case photo
    case video
    case raw
    case live_photo
}

public enum AvailabilityStatus: String, Codable, Sendable {
    case available
    case offline
    case missing
}

public struct AssetRecord: Codable, Sendable, Identifiable {
    public let id: String
    public let driveId: String
    public var driveName: String?
    public let originalFilename: String
    public let relativePath: String
    public let fileExtension: String
    public let mediaType: MediaType
    public let mimeType: String
    public let fileSize: Int64
    public var checksum: String?
    public var dateTaken: String?
    public var dateImported: String
    public var modifiedAt: String?
    public var width: Int
    public var height: Int
    public var duration: Double?
    public var latitude: Double?
    public var longitude: Double?
    public var altitude: Double?
    public var cameraMake: String?
    public var cameraModel: String?
    public var lensModel: String?
    public var iso: Int?
    public var focalLength: Double?
    public var aperture: Double?
    public var shutterSpeed: String?
    public var isFavorite: Bool
    public var thumbnailPath: String?
    public var previewPath: String?
    public var availabilityStatus: AvailabilityStatus
    public var city: String?
    public var state: String?
    public var country: String?
    public var placeName: String?

    public init(
        id: String = UUID().uuidString,
        driveId: String,
        driveName: String? = nil,
        originalFilename: String,
        relativePath: String,
        fileExtension: String,
        mediaType: MediaType,
        mimeType: String,
        fileSize: Int64,
        checksum: String? = nil,
        dateTaken: String? = nil,
        dateImported: String = ISO8601DateFormatter().string(from: Date()),
        modifiedAt: String? = nil,
        width: Int = 0,
        height: Int = 0,
        duration: Double? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil,
        altitude: Double? = nil,
        cameraMake: String? = nil,
        cameraModel: String? = nil,
        lensModel: String? = nil,
        iso: Int? = nil,
        focalLength: Double? = nil,
        aperture: Double? = nil,
        shutterSpeed: String? = nil,
        isFavorite: Bool = false,
        thumbnailPath: String? = nil,
        previewPath: String? = nil,
        availabilityStatus: AvailabilityStatus = .available,
        city: String? = nil,
        state: String? = nil,
        country: String? = nil,
        placeName: String? = nil
    ) {
        self.id = id
        self.driveId = driveId
        self.driveName = driveName
        self.originalFilename = originalFilename
        self.relativePath = relativePath
        self.fileExtension = fileExtension.lowercased()
        self.mediaType = mediaType
        self.mimeType = mimeType
        self.fileSize = fileSize
        self.checksum = checksum
        self.dateTaken = dateTaken
        self.dateImported = dateImported
        self.modifiedAt = modifiedAt
        self.width = width
        self.height = height
        self.duration = duration
        self.latitude = latitude
        self.longitude = longitude
        self.altitude = altitude
        self.cameraMake = cameraMake
        self.cameraModel = cameraModel
        self.lensModel = lensModel
        self.iso = iso
        self.focalLength = focalLength
        self.aperture = aperture
        self.shutterSpeed = shutterSpeed
        self.isFavorite = isFavorite
        self.thumbnailPath = thumbnailPath
        self.previewPath = previewPath
        self.availabilityStatus = availabilityStatus
        self.city = city
        self.state = state
        self.country = country
        self.placeName = placeName
    }
}
