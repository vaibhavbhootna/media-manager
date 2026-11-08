import Foundation

public actor GeoService {
    public static let shared = GeoService()

    private var lastRequestTime: Date = Date.distantPast

    private init() {}

    /// Reverse geocodes coordinates (rounded to 0.01 precision, ~1km) to City, State, Country, and Place Name.
    /// Rate limited and resilient with 4-second timeout to avoid stalling scan loops.
    public func reverseGeocode(latitude: Double, longitude: Double) async -> (city: String?, state: String?, country: String?, placeName: String?)? {
        let roundedLat = (latitude * 100).rounded() / 100
        let roundedLon = (longitude * 100).rounded() / 100

        // Enforce polite rate limiting for OpenStreetMap Nominatim (min 1 sec between calls)
        let elapsed = Date().timeIntervalSince(lastRequestTime)
        if elapsed < 1.0 {
            try? await Task.sleep(nanoseconds: UInt64((1.0 - elapsed) * 1_000_000_000))
        }
        lastRequestTime = Date()

        guard let url = URL(string: "https://nominatim.openstreetmap.org/reverse?format=json&lat=\(roundedLat)&lon=\(roundedLon)&zoom=14&addressdetails=1") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.setValue("MediaManager/1.0 (offline-first-media-library)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 4.0

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
                return nil
            }

            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }

            let address = json["address"] as? [String: Any]
            let city = (address?["city"] ?? address?["town"] ?? address?["village"] ?? address?["municipality"] ?? address?["city_district"] ?? address?["county"]) as? String
            let state = (address?["state"] ?? address?["region"]) as? String
            let country = address?["country"] as? String
            let displayName = json["display_name"] as? String

            return (city, state, country, displayName)
        } catch {
            return nil
        }
    }
}

