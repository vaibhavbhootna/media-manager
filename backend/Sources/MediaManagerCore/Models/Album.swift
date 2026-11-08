import Foundation

public enum AlbumType: String, Codable, Sendable {
    case manual
    case smart
}

public struct SmartAlbumRules: Codable, Sendable {
    public var category: String? // "year", "country", "city", "trip", "event", "custom"
    public var year: Int?
    public var country: String?
    public var city: String?
    public var startDate: String? // "YYYY-MM-DD"
    public var endDate: String?   // "YYYY-MM-DD"
    public var searchQuery: String?
    public var mediaType: MediaType?
    public var isFavorite: Bool?
    public var eventType: String? // "birthday", "anniversary", "custom"
    public var personName: String?

    public init(
        category: String? = nil,
        year: Int? = nil,
        country: String? = nil,
        city: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        searchQuery: String? = nil,
        mediaType: MediaType? = nil,
        isFavorite: Bool? = nil,
        eventType: String? = nil,
        personName: String? = nil
    ) {
        self.category = category
        self.year = year
        self.country = country
        self.city = city
        self.startDate = startDate
        self.endDate = endDate
        self.searchQuery = searchQuery
        self.mediaType = mediaType
        self.isFavorite = isFavorite
        self.eventType = eventType
        self.personName = personName
    }
}

public struct AlbumRecord: Codable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public var description: String?
    public var coverAssetId: String?
    public var coverThumbnailUrl: String?
    public var albumType: AlbumType
    public var assetCount: Int
    public var createdAt: String
    public var updatedAt: String
    public var rulesJson: String?

    public init(
        id: String = UUID().uuidString,
        name: String,
        description: String? = nil,
        coverAssetId: String? = nil,
        coverThumbnailUrl: String? = nil,
        albumType: AlbumType = .manual,
        assetCount: Int = 0,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date()),
        rulesJson: String? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.coverAssetId = coverAssetId
        self.coverThumbnailUrl = coverThumbnailUrl
        self.albumType = albumType
        self.assetCount = assetCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.rulesJson = rulesJson
    }
}

public struct SmartAlbumRuleRecord: Codable, Sendable {
    public let id: String
    public let albumId: String
    public let rulesJson: String

    public init(id: String = UUID().uuidString, albumId: String, rulesJson: String) {
        self.id = id
        self.albumId = albumId
        self.rulesJson = rulesJson
    }
}

public enum FamilyEventType: String, Codable, Sendable {
    case birthday
    case anniversary
    case custom
}

public struct FamilyEventRecord: Codable, Sendable, Identifiable {
    public let id: String
    public var personName: String
    public var eventType: FamilyEventType
    public var eventDate: String // "MM-DD" e.g. "11-24" or "YYYY-MM-DD"
    public var windowDays: Int
    public var notes: String?
    public var createdAt: String

    public init(
        id: String = UUID().uuidString,
        personName: String,
        eventType: FamilyEventType = .birthday,
        eventDate: String,
        windowDays: Int = 1,
        notes: String? = nil,
        createdAt: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.id = id
        self.personName = personName
        self.eventType = eventType
        self.eventDate = eventDate
        self.windowDays = windowDays
        self.notes = notes
        self.createdAt = createdAt
    }
}

public struct CollectionsMeta: Codable, Sendable {
    public struct NamedCount: Codable, Sendable {
        public let name: String
        public let country: String?
        public let count: Int

        public init(name: String, country: String? = nil, count: Int) {
            self.name = name
            self.country = country
            self.count = count
        }
    }

    public struct CountryGroup: Codable, Sendable {
        public let country: String
        public let totalCount: Int
        public let cities: [NamedCount]

        public init(country: String, totalCount: Int, cities: [NamedCount]) {
            self.country = country
            self.totalCount = totalCount
            self.cities = cities
        }
    }

    public let years: [Int]
    public let countries: [NamedCount]
    public let cities: [NamedCount]
    public let countryGroups: [CountryGroup]

    public init(years: [Int], countries: [NamedCount], cities: [NamedCount], countryGroups: [CountryGroup] = []) {
        self.years = years
        self.countries = countries
        self.cities = cities
        self.countryGroups = countryGroups
    }
}
