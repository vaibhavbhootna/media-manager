import Foundation
import ImageIO
import AVFoundation
import CoreGraphics
import UniformTypeIdentifiers

public struct AssetMetadata: Sendable {
    public var width: Int
    public var height: Int
    public var mediaType: MediaType
    public var mimeType: String
    public var dateTaken: String?
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

    public init(
        width: Int = 0,
        height: Int = 0,
        mediaType: MediaType = .photo,
        mimeType: String = "application/octet-stream",
        dateTaken: String? = nil,
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
        shutterSpeed: String? = nil
    ) {
        self.width = width
        self.height = height
        self.mediaType = mediaType
        self.mimeType = mimeType
        self.dateTaken = dateTaken
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
    }
}

public actor MediaProcessor {
    public static let shared = MediaProcessor()

    private let isoFormatter = ISO8601DateFormatter()
    private let exifDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy:MM:dd HH:mm:ss"
        f.timeZone = TimeZone.current
        return f
    }()

    public init() {}

    public func extractMetadata(fileURL: URL) -> AssetMetadata {
        let ext = fileURL.pathExtension.lowercased()
        let isVideo = ["mov", "mp4", "m4v", "avi", "mkv"].contains(ext)

        if isVideo {
            return extractVideoMetadata(fileURL: fileURL)
        } else {
            return extractImageMetadata(fileURL: fileURL)
        }
    }

    private func extractImageMetadata(fileURL: URL) -> AssetMetadata {
        var meta = AssetMetadata()
        let ext = fileURL.pathExtension.lowercased()
        meta.mediaType = ["dng", "raw", "cr2", "nef", "arw"].contains(ext) ? .raw : .photo
        meta.mimeType = UTType(filenameExtension: ext)?.preferredMIMEType ?? "image/jpeg"

        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else {
            return meta
        }

        if let w = props[kCGImagePropertyPixelWidth] as? Int { meta.width = w }
        if let h = props[kCGImagePropertyPixelHeight] as? Int { meta.height = h }

        // TIFF (Make, Model)
        if let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] {
            if let make = tiff[kCGImagePropertyTIFFMake] as? String { meta.cameraMake = make.trimmingCharacters(in: .whitespaces) }
            if let model = tiff[kCGImagePropertyTIFFModel] as? String { meta.cameraModel = model.trimmingCharacters(in: .whitespaces) }
            if let dateStr = tiff[kCGImagePropertyTIFFDateTime] as? String, meta.dateTaken == nil {
                if let d = exifDateFormatter.date(from: dateStr) {
                    meta.dateTaken = isoFormatter.string(from: d)
                }
            }
        }

        // EXIF
        if let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] {
            if let dateStr = (exif[kCGImagePropertyExifDateTimeOriginal] ?? exif[kCGImagePropertyExifDateTimeDigitized]) as? String {
                if let d = exifDateFormatter.date(from: dateStr) {
                    meta.dateTaken = isoFormatter.string(from: d)
                }
            }
            if let iso = (exif[kCGImagePropertyExifISOSpeedRatings] as? [Int])?.first {
                meta.iso = iso
            }
            if let fn = exif[kCGImagePropertyExifFNumber] as? Double {
                meta.aperture = fn
            }
            if let fl = exif[kCGImagePropertyExifFocalLength] as? Double {
                meta.focalLength = fl
            }
            if let exp = exif[kCGImagePropertyExifExposureTime] as? Double {
                if exp < 1.0 && exp > 0 {
                    meta.shutterSpeed = "1/\(Int(round(1.0 / exp)))"
                } else {
                    meta.shutterSpeed = "\(exp)s"
                }
            }
            if let lm = exif[kCGImagePropertyExifLensModel] as? String {
                meta.lensModel = lm.trimmingCharacters(in: .whitespaces)
            }
        }

        // GPS
        if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any] {
            if let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
               let latRef = gps[kCGImagePropertyGPSLatitudeRef] as? String {
                meta.latitude = (latRef == "S") ? -lat : lat
            }
            if let lon = gps[kCGImagePropertyGPSLongitude] as? Double,
               let lonRef = gps[kCGImagePropertyGPSLongitudeRef] as? String {
                meta.longitude = (lonRef == "W") ? -lon : lon
            }
            if let alt = gps[kCGImagePropertyGPSAltitude] as? Double {
                meta.altitude = alt
            }
        }

        // Fallback to filename or directory date (true capture timestamp)
        if meta.dateTaken == nil {
            meta.dateTaken = parseDateFromFilenameOrPath(fileURL)
        }

        // Fallback to file creation date if no EXIF date or filename date
        if meta.dateTaken == nil {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let creationDate = attrs[.creationDate] as? Date {
                meta.dateTaken = isoFormatter.string(from: creationDate)
            }
        }

        return meta
    }

    private func extractVideoMetadata(fileURL: URL) -> AssetMetadata {
        var meta = AssetMetadata()
        meta.mediaType = .video
        let ext = fileURL.pathExtension.lowercased()
        meta.mimeType = UTType(filenameExtension: ext)?.preferredMIMEType ?? "video/quicktime"

        let asset = AVURLAsset(url: fileURL)
        meta.duration = CMTimeGetSeconds(asset.duration)

        if let track = asset.tracks(withMediaType: .video).first {
            let size = track.naturalSize.applying(track.preferredTransform)
            meta.width = Int(abs(size.width))
            meta.height = Int(abs(size.height))
        }

        // 1. Extract true capture date and camera info from AVAsset metadata
        for item in asset.metadata {
            let keyStr = item.identifier?.rawValue ?? ""
            let commonKeyStr = item.commonKey?.rawValue ?? ""

            // Capture Date
            if meta.dateTaken == nil {
                if keyStr == "mdta/com.apple.quicktime.creationdate" || commonKeyStr == "creationDate" {
                    if let rawDateStr = item.stringValue {
                        if let d = parseDateString(rawDateStr) {
                            meta.dateTaken = isoFormatter.string(from: d)
                        } else {
                            meta.dateTaken = rawDateStr
                        }
                    }
                }
            }

            // Camera Make & Model
            if meta.cameraMake == nil && (keyStr == "mdta/com.apple.quicktime.make" || commonKeyStr == "make") {
                meta.cameraMake = item.stringValue?.trimmingCharacters(in: .whitespaces)
            }
            if meta.cameraModel == nil && (keyStr == "mdta/com.apple.quicktime.model" || commonKeyStr == "model") {
                meta.cameraModel = item.stringValue?.trimmingCharacters(in: .whitespaces)
            }

            // Location
            if meta.latitude == nil && (keyStr == "mdta/com.apple.quicktime.location.ISO6709" || commonKeyStr == "location") {
                if let locStr = item.stringValue {
                    parseISO6709Location(locStr, meta: &meta)
                }
            }
        }

        // 2. Fallback to Filename or Directory date (capture timestamp prefix: YYYYMMDD_HHMMSS)
        if meta.dateTaken == nil {
            meta.dateTaken = parseDateFromFilenameOrPath(fileURL)
        }

        // 3. Last fallback to file system creation date
        if meta.dateTaken == nil {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let creationDate = attrs[.creationDate] as? Date {
                meta.dateTaken = isoFormatter.string(from: creationDate)
            }
        }

        return meta
    }

    private func parseDateFromFilenameOrPath(_ fileURL: URL) -> String? {
        let filename = fileURL.lastPathComponent
        // 1. Match YYYYMMDD_HHMMSS (e.g. 20220910_065549)
        let regex = try? NSRegularExpression(pattern: #"(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})"#)
        if let match = regex?.firstMatch(in: filename, range: NSRange(location: 0, length: filename.utf16.count)) {
            let nsStr = filename as NSString
            let y = nsStr.substring(with: match.range(at: 1))
            let m = nsStr.substring(with: match.range(at: 2))
            let d = nsStr.substring(with: match.range(at: 3))
            let h = nsStr.substring(with: match.range(at: 4))
            let min = nsStr.substring(with: match.range(at: 5))
            let s = nsStr.substring(with: match.range(at: 6))
            return "\(y)-\(m)-\(d)T\(h):\(min):\(s)Z"
        }
        // 2. Match directory YYYY-MM-DD
        let parentDir = fileURL.deletingLastPathComponent().lastPathComponent
        let dirRegex = try? NSRegularExpression(pattern: #"^(\d{4})-(\d{2})-(\d{2})$"#)
        if let match = dirRegex?.firstMatch(in: parentDir, range: NSRange(location: 0, length: parentDir.utf16.count)) {
            let nsStr = parentDir as NSString
            let y = nsStr.substring(with: match.range(at: 1))
            let m = nsStr.substring(with: match.range(at: 2))
            let d = nsStr.substring(with: match.range(at: 3))
            return "\(y)-\(m)-\(d)T00:00:00Z"
        }
        return nil
    }

    private func parseDateString(_ raw: String) -> Date? {
        let formats = [
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd'T'HH:mm:ssZZZZZ",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy:MM:dd HH:mm:ss",
            "yyyyMMdd_HHmmss"
        ]
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_US_POSIX")
        for fmt in formats {
            df.dateFormat = fmt
            if let d = df.date(from: raw) { return d }
        }
        return ISO8601DateFormatter().date(from: raw)
    }

    private func parseISO6709Location(_ locStr: String, meta: inout AssetMetadata) {
        let regex = try? NSRegularExpression(pattern: #"([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:([+-]\d+(?:\.\d+)?))?"#)
        if let match = regex?.firstMatch(in: locStr, range: NSRange(location: 0, length: locStr.utf16.count)) {
            let ns = locStr as NSString
            let latStr = ns.substring(with: match.range(at: 1))
            let lonStr = ns.substring(with: match.range(at: 2))
            meta.latitude = Double(latStr)
            meta.longitude = Double(lonStr)
            if match.numberOfRanges > 3 && match.range(at: 3).location != NSNotFound {
                let altStr = ns.substring(with: match.range(at: 3))
                meta.altitude = Double(altStr)
            }
        }
    }

    // MARK: - Thumbnail & Preview Generation

    public func generateThumbnailAndPreview(sourceURL: URL, assetId: String) throws -> (thumbnailPath: String, previewPath: String) {
        let ext = sourceURL.pathExtension.lowercased()
        let isVideo = ["mov", "mp4", "m4v", "avi", "mkv"].contains(ext)

        let thumbFilename = "\(assetId)_thumb.jpg"
        let prevFilename = "\(assetId)_prev.jpg"
        let thumbDest = SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbFilename)
        let prevDest = SystemPaths.previewsDirectory.appendingPathComponent(prevFilename)

        if isVideo {
            try generateVideoThumbnail(sourceURL: sourceURL, thumbURL: thumbDest, prevURL: prevDest)
        } else {
            try generateImageThumbnail(sourceURL: sourceURL, thumbURL: thumbDest, prevURL: prevDest)
        }

        return (thumbnailPath: thumbFilename, previewPath: prevFilename)
    }

    private func generateImageThumbnail(sourceURL: URL, thumbURL: URL, prevURL: URL) throws {
        guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else {
            throw NSError(domain: "MediaProcessor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create ImageSource from \(sourceURL.path)"])
        }

        // Fast thumbnail (320px) - prefer embedded thumbnail if available for 10x-50x speedup
        let thumbOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceCreateThumbnailFromImageIfAbsent: true,
            kCGImageSourceThumbnailMaxPixelSize: 320
        ]
        var thumbCG = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary)
        if thumbCG == nil {
            let fallbackOptions: [CFString: Any] = [
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 320
            ]
            thumbCG = CGImageSourceCreateThumbnailAtIndex(source, 0, fallbackOptions as CFDictionary)
        }
        if let thumbCG = thumbCG {
            writeCGImageToJPEG(image: thumbCG, destinationURL: thumbURL, quality: 0.8)
        }

        // Medium Preview (1280px)
        let prevOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 1280
        ]
        if let prevCG = CGImageSourceCreateThumbnailAtIndex(source, 0, prevOptions as CFDictionary) {
            writeCGImageToJPEG(image: prevCG, destinationURL: prevURL, quality: 0.8)
        }
    }

    public func generatePreviewOnDemand(sourceURL: URL, assetId: String) throws -> String {
        let prevFilename = "\(assetId)_prev.jpg"
        let prevDest = SystemPaths.previewsDirectory.appendingPathComponent(prevFilename)
        if FileManager.default.fileExists(atPath: prevDest.path) {
            return prevFilename
        }
        let ext = sourceURL.pathExtension.lowercased()
        let isVideo = ["mov", "mp4", "m4v", "avi", "mkv"].contains(ext)
        if isVideo {
            let asset = AVURLAsset(url: sourceURL)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 1920, height: 1920)
            let time = CMTime(seconds: min(1.0, max(0.0, CMTimeGetSeconds(asset.duration) / 2)), preferredTimescale: 600)
            let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
            writeCGImageToJPEG(image: cgImage, destinationURL: prevDest, quality: 0.85)
        } else {
            guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else {
                throw NSError(domain: "MediaProcessor", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to create ImageSource from \(sourceURL.path)"])
            }
            let prevOptions: [CFString: Any] = [
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 1920
            ]
            if let prevCG = CGImageSourceCreateThumbnailAtIndex(source, 0, prevOptions as CFDictionary) {
                writeCGImageToJPEG(image: prevCG, destinationURL: prevDest, quality: 0.85)
            }
        }
        return prevFilename
    }

    private func generateVideoThumbnail(sourceURL: URL, thumbURL: URL, prevURL: URL) throws {
        let asset = AVURLAsset(url: sourceURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1920, height: 1920)

        let time = CMTime(seconds: min(1.0, max(0.0, CMTimeGetSeconds(asset.duration) / 2)), preferredTimescale: 600)
        let cgImage = try generator.copyCGImage(at: time, actualTime: nil)

        // Write preview
        writeCGImageToJPEG(image: cgImage, destinationURL: prevURL, quality: 0.85)

        // Downscale for thumbnail
        let thumbWidth = 320
        let aspect = CGFloat(cgImage.height) / CGFloat(cgImage.width)
        let thumbHeight = Int(CGFloat(thumbWidth) * aspect)

        if let context = CGContext(
            data: nil,
            width: thumbWidth,
            height: thumbHeight,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) {
            context.interpolationQuality = .high
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: thumbWidth, height: thumbHeight))
            if let scaledImage = context.makeImage() {
                writeCGImageToJPEG(image: scaledImage, destinationURL: thumbURL, quality: 0.8)
            }
        }
    }

    private func writeCGImageToJPEG(image: CGImage, destinationURL: URL, quality: Double) {
        guard let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return }
        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: quality
        ]
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        CGImageDestinationFinalize(destination)
    }
}
