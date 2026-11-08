import Foundation
import SQLite3

public struct AssetQueryFilter: Sendable {
    public var mediaType: MediaType?
    public var isFavorite: Bool?
    public var driveId: String?
    public var albumId: String?
    public var availabilityStatus: AvailabilityStatus?
    public var searchQuery: String?
    public var year: Int?
    public var country: String?
    public var city: String?
    public var startDate: String?
    public var endDate: String?
    public var limit: Int
    public var offset: Int

    public init(
        mediaType: MediaType? = nil,
        isFavorite: Bool? = nil,
        driveId: String? = nil,
        albumId: String? = nil,
        availabilityStatus: AvailabilityStatus? = nil,
        searchQuery: String? = nil,
        year: Int? = nil,
        country: String? = nil,
        city: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        limit: Int = 50,
        offset: Int = 0
    ) {
        self.mediaType = mediaType
        self.isFavorite = isFavorite
        self.driveId = driveId
        self.albumId = albumId
        self.availabilityStatus = availabilityStatus
        self.searchQuery = searchQuery
        self.year = year
        self.country = country
        self.city = city
        self.startDate = startDate
        self.endDate = endDate
        self.limit = limit
        self.offset = offset
    }
}

public actor DatabaseManager {
    public static let shared = DatabaseManager()

    private var db: OpaquePointer?
    private let dbURL: URL

    public init(url: URL = SystemPaths.databaseURL) {
        self.dbURL = url
    }

    public func initialize() throws {
        let path = dbURL.path
        if sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) != SQLITE_OK {
            let errmsg = String(cString: sqlite3_errmsg(db))
            throw NSError(domain: "DatabaseManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to open SQLite db: \(errmsg)"])
        }

        try executeRaw("PRAGMA journal_mode = WAL;")
        try executeRaw("PRAGMA foreign_keys = ON;")
        try executeRaw("PRAGMA synchronous = NORMAL;")
        try executeRaw("PRAGMA busy_timeout = 5000;")

        try migrateSchema()
    }

    private func executeRaw(_ sql: String) throws {
        var err: UnsafeMutablePointer<CChar>?
        if sqlite3_exec(db, sql, nil, nil, &err) != SQLITE_OK {
            let msg = err != nil ? String(cString: err!) : "Unknown SQLite error"
            sqlite3_free(err)
            throw NSError(domain: "DatabaseManager", code: 2, userInfo: [NSLocalizedDescriptionKey: msg])
        }
    }

    public func executeTransaction<T>(_ block: () throws -> T) throws -> T {
        try executeRaw("BEGIN IMMEDIATE TRANSACTION;")
        do {
            let result = try block()
            try executeRaw("COMMIT;")
            return result
        } catch {
            try? executeRaw("ROLLBACK;")
            throw error
        }
    }

    private func migrateSchema() throws {
        let schemaSQL = """
        CREATE TABLE IF NOT EXISTS drives (
            id TEXT PRIMARY KEY,
            drive_name TEXT NOT NULL,
            volume_uuid TEXT,
            mount_path TEXT,
            filesystem_type TEXT,
            total_capacity INTEGER DEFAULT 0,
            available_capacity INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'disconnected',
            last_connected TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            drive_id TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            file_extension TEXT NOT NULL,
            media_type TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            checksum TEXT,
            date_taken TEXT,
            date_imported TEXT NOT NULL,
            modified_at TEXT,
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            duration REAL DEFAULT 0.0,
            latitude REAL,
            longitude REAL,
            altitude REAL,
            camera_make TEXT,
            camera_model TEXT,
            lens_model TEXT,
            iso INTEGER,
            focal_length REAL,
            aperture REAL,
            shutter_speed TEXT,
            is_favorite INTEGER DEFAULT 0,
            thumbnail_path TEXT,
            preview_path TEXT,
            availability_status TEXT NOT NULL DEFAULT 'available',
            city TEXT,
            state TEXT,
            country TEXT,
            place_name TEXT,
            FOREIGN KEY(drive_id) REFERENCES drives(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            cover_asset_id TEXT,
            album_type TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(cover_asset_id) REFERENCES assets(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS album_assets (
            album_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            added_at TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            PRIMARY KEY(album_id, asset_id),
            FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS smart_album_rules (
            id TEXT PRIMARY KEY,
            album_id TEXT NOT NULL UNIQUE,
            rules_json TEXT NOT NULL,
            FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS geo_cache (
            rounded_lat REAL,
            rounded_lon REAL,
            city TEXT,
            state TEXT,
            country TEXT,
            place_name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (rounded_lat, rounded_lon)
        );

        CREATE TABLE IF NOT EXISTS family_events (
            id TEXT PRIMARY KEY,
            person_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            event_date TEXT NOT NULL,
            window_days INTEGER DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_assets_drive_id ON assets(drive_id);
        CREATE INDEX IF NOT EXISTS idx_assets_date_taken ON assets(date_taken DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_media_type ON assets(media_type);
        CREATE INDEX IF NOT EXISTS idx_assets_is_favorite ON assets(is_favorite);
        CREATE INDEX IF NOT EXISTS idx_assets_availability ON assets(availability_status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_drive_relative_path ON assets(drive_id, relative_path);
        CREATE INDEX IF NOT EXISTS idx_album_assets_album ON album_assets(album_id, position);
        CREATE INDEX IF NOT EXISTS idx_album_assets_asset ON album_assets(asset_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
            asset_id UNINDEXED,
            original_filename,
            camera_make,
            camera_model,
            lens_model,
            city,
            state,
            country,
            place_name,
            tokenize = 'unicode61 remove_diacritics 2'
        );
        """
        try executeRaw(schemaSQL)

        // Safety column additions for backwards compatibility
        _ = sqlite3_exec(db, "ALTER TABLE assets ADD COLUMN city TEXT;", nil, nil, nil)
        _ = sqlite3_exec(db, "ALTER TABLE assets ADD COLUMN state TEXT;", nil, nil, nil)
        _ = sqlite3_exec(db, "ALTER TABLE assets ADD COLUMN country TEXT;", nil, nil, nil)
        _ = sqlite3_exec(db, "ALTER TABLE assets ADD COLUMN place_name TEXT;", nil, nil, nil)
    }

    // MARK: - Drive Operations

    public func upsertDrive(_ drive: DriveRecord) throws {
        let sql = """
        INSERT INTO drives (id, drive_name, volume_uuid, mount_path, filesystem_type, total_capacity, available_capacity, status, last_connected, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            drive_name = excluded.drive_name,
            volume_uuid = excluded.volume_uuid,
            mount_path = excluded.mount_path,
            filesystem_type = excluded.filesystem_type,
            total_capacity = excluded.total_capacity,
            available_capacity = excluded.available_capacity,
            status = excluded.status,
            last_connected = excluded.last_connected;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw getLastError()
        }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (drive.id as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (drive.driveName as NSString).utf8String, -1, nil)
        if let vol = drive.volumeUuid { sqlite3_bind_text(stmt, 3, (vol as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 3) }
        if let mount = drive.mountPath { sqlite3_bind_text(stmt, 4, (mount as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 4) }
        if let fs = drive.filesystemType { sqlite3_bind_text(stmt, 5, (fs as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 5) }
        sqlite3_bind_int64(stmt, 6, drive.totalCapacity)
        sqlite3_bind_int64(stmt, 7, drive.availableCapacity)
        sqlite3_bind_text(stmt, 8, (drive.status.rawValue as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 9, (drive.lastConnected as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 10, (drive.createdAt as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func getDrive(id: String) throws -> DriveRecord? {
        let sql = "SELECT id, drive_name, volume_uuid, mount_path, filesystem_type, total_capacity, available_capacity, status, last_connected, created_at FROM drives WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) == SQLITE_ROW {
            return readDriveRow(stmt: stmt)
        }
        return nil
    }

    public func getAllDrives() throws -> [DriveRecord] {
        let sql = """
        SELECT d.id, d.drive_name, d.volume_uuid, d.mount_path, d.filesystem_type, d.total_capacity, d.available_capacity, d.status, d.last_connected, d.created_at,
               (SELECT COUNT(*) FROM assets WHERE drive_id = d.id) as asset_count
        FROM drives d ORDER BY d.drive_name ASC;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        var list: [DriveRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            var drive = readDriveRow(stmt: stmt)
            let assetCount = Int(sqlite3_column_int(stmt, 10))
            drive.assetCount = assetCount
            list.append(drive)
        }
        return list
    }

    public func updateDriveStatus(id: String, status: DriveStatus, mountPath: String?) throws {
        let sql = "UPDATE drives SET status = ?, mount_path = ?, last_connected = ? WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        let now = ISO8601DateFormatter().string(from: Date())
        sqlite3_bind_text(stmt, 1, (status.rawValue as NSString).utf8String, -1, nil)
        if let mp = mountPath { sqlite3_bind_text(stmt, 2, (mp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 2) }
        sqlite3_bind_text(stmt, 3, (now as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 4, (id as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }

        // Also update assets availability for this drive
        let assetStatus = (status == .connected) ? AvailabilityStatus.available : AvailabilityStatus.offline
        try updateDriveAssetsAvailability(driveId: id, status: assetStatus)
    }

    public func updateDriveAssetsAvailability(driveId: String, status: AvailabilityStatus) throws {
        let sql = "UPDATE assets SET availability_status = ? WHERE drive_id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (status.rawValue as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (driveId as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    // MARK: - Asset Operations

    public func upsertAsset(_ asset: AssetRecord) throws {
        let sql = """
        INSERT INTO assets (
            id, drive_id, original_filename, relative_path, file_extension, media_type, mime_type, file_size,
            checksum, date_taken, date_imported, modified_at, width, height, duration, latitude, longitude,
            altitude, camera_make, camera_model, lens_model, iso, focal_length, aperture, shutter_speed,
            is_favorite, thumbnail_path, preview_path, availability_status,
            city, state, country, place_name
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(drive_id, relative_path) DO UPDATE SET
            original_filename = excluded.original_filename,
            relative_path = excluded.relative_path,
            file_extension = excluded.file_extension,
            media_type = excluded.media_type,
            mime_type = excluded.mime_type,
            file_size = excluded.file_size,
            checksum = excluded.checksum,
            date_taken = excluded.date_taken,
            modified_at = excluded.modified_at,
            width = excluded.width,
            height = excluded.height,
            duration = excluded.duration,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            altitude = excluded.altitude,
            camera_make = excluded.camera_make,
            camera_model = excluded.camera_model,
            lens_model = excluded.lens_model,
            iso = excluded.iso,
            focal_length = excluded.focal_length,
            aperture = excluded.aperture,
            shutter_speed = excluded.shutter_speed,
            thumbnail_path = COALESCE(excluded.thumbnail_path, assets.thumbnail_path),
            preview_path = COALESCE(excluded.preview_path, assets.preview_path),
            availability_status = excluded.availability_status,
            city = COALESCE(excluded.city, assets.city),
            state = COALESCE(excluded.state, assets.state),
            country = COALESCE(excluded.country, assets.country),
            place_name = COALESCE(excluded.place_name, assets.place_name);
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (asset.id as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (asset.driveId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 3, (asset.originalFilename as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 4, (asset.relativePath as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 5, (asset.fileExtension as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 6, (asset.mediaType.rawValue as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 7, (asset.mimeType as NSString).utf8String, -1, nil)
        sqlite3_bind_int64(stmt, 8, asset.fileSize)
        if let ck = asset.checksum { sqlite3_bind_text(stmt, 9, (ck as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 9) }
        if let dt = asset.dateTaken { sqlite3_bind_text(stmt, 10, (dt as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 10) }
        sqlite3_bind_text(stmt, 11, (asset.dateImported as NSString).utf8String, -1, nil)
        if let ma = asset.modifiedAt { sqlite3_bind_text(stmt, 12, (ma as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 12) }
        sqlite3_bind_int(stmt, 13, Int32(asset.width))
        sqlite3_bind_int(stmt, 14, Int32(asset.height))
        if let dur = asset.duration { sqlite3_bind_double(stmt, 15, dur) } else { sqlite3_bind_null(stmt, 15) }
        if let lat = asset.latitude { sqlite3_bind_double(stmt, 16, lat) } else { sqlite3_bind_null(stmt, 16) }
        if let lon = asset.longitude { sqlite3_bind_double(stmt, 17, lon) } else { sqlite3_bind_null(stmt, 17) }
        if let alt = asset.altitude { sqlite3_bind_double(stmt, 18, alt) } else { sqlite3_bind_null(stmt, 18) }
        if let cm = asset.cameraMake { sqlite3_bind_text(stmt, 19, (cm as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 19) }
        if let cmd = asset.cameraModel { sqlite3_bind_text(stmt, 20, (cmd as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 20) }
        if let lm = asset.lensModel { sqlite3_bind_text(stmt, 21, (lm as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 21) }
        if let iso = asset.iso { sqlite3_bind_int(stmt, 22, Int32(iso)) } else { sqlite3_bind_null(stmt, 22) }
        if let fl = asset.focalLength { sqlite3_bind_double(stmt, 23, fl) } else { sqlite3_bind_null(stmt, 23) }
        if let ap = asset.aperture { sqlite3_bind_double(stmt, 24, ap) } else { sqlite3_bind_null(stmt, 24) }
        if let ss = asset.shutterSpeed { sqlite3_bind_text(stmt, 25, (ss as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 25) }
        sqlite3_bind_int(stmt, 26, asset.isFavorite ? 1 : 0)
        if let tp = asset.thumbnailPath { sqlite3_bind_text(stmt, 27, (tp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 27) }
        if let pp = asset.previewPath { sqlite3_bind_text(stmt, 28, (pp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 28) }
        sqlite3_bind_text(stmt, 29, (asset.availabilityStatus.rawValue as NSString).utf8String, -1, nil)
        if let c = asset.city { sqlite3_bind_text(stmt, 30, (c as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 30) }
        if let s = asset.state { sqlite3_bind_text(stmt, 31, (s as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 31) }
        if let cn = asset.country { sqlite3_bind_text(stmt, 32, (cn as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 32) }
        if let pn = asset.placeName { sqlite3_bind_text(stmt, 33, (pn as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 33) }

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }

        // Sync FTS
        try indexAssetFTS(asset)
    }

    private func indexAssetFTS(_ asset: AssetRecord) throws {
        let delSql = "DELETE FROM assets_fts WHERE asset_id = ?;"
        var delStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, delSql, -1, &delStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(delStmt, 1, (asset.id as NSString).utf8String, -1, nil)
            _ = sqlite3_step(delStmt)
            sqlite3_finalize(delStmt)
        }

        let sql = """
        INSERT INTO assets_fts (asset_id, original_filename, camera_make, camera_model, lens_model, city, state, country, place_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, (asset.id as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 2, (asset.originalFilename as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 3, ((asset.cameraMake ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 4, ((asset.cameraModel ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 5, ((asset.lensModel ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 6, ((asset.city ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 7, ((asset.state ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 8, ((asset.country ?? "") as NSString).utf8String, -1, nil)
            sqlite3_bind_text(stmt, 9, ((asset.placeName ?? "") as NSString).utf8String, -1, nil)
            _ = sqlite3_step(stmt)
            sqlite3_finalize(stmt)
        }
    }

    public func updateAssetThumbnails(id: String, thumbnailPath: String?, previewPath: String?) throws {
        let sql = "UPDATE assets SET thumbnail_path = ?, preview_path = ? WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        if let tp = thumbnailPath { sqlite3_bind_text(stmt, 1, (tp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 1) }
        if let pp = previewPath { sqlite3_bind_text(stmt, 2, (pp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 2) }
        sqlite3_bind_text(stmt, 3, (id as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func getAsset(id: String) throws -> AssetRecord? {
        let sql = """
        SELECT a.id, a.drive_id, d.drive_name, a.original_filename, a.relative_path, a.file_extension, a.media_type, a.mime_type,
               a.file_size, a.checksum, a.date_taken, a.date_imported, a.modified_at, a.width, a.height, a.duration,
               a.latitude, a.longitude, a.altitude, a.camera_make, a.camera_model, a.lens_model, a.iso, a.focal_length,
               a.aperture, a.shutter_speed, a.is_favorite, a.thumbnail_path, a.preview_path, a.availability_status,
               a.city, a.state, a.country, a.place_name
        FROM assets a
        LEFT JOIN drives d ON a.drive_id = d.id
        WHERE a.id = ?;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) == SQLITE_ROW {
            return readAssetRow(stmt: stmt)
        }
        return nil
    }

    public func findAssetByRelativePath(driveId: String, relativePath: String) throws -> AssetRecord? {
        let sql = "SELECT id FROM assets WHERE drive_id = ? AND relative_path = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (driveId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (relativePath as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(stmt, 0))
            return try getAsset(id: id)
        }
        return nil
    }

    public func removeDuplicateAssets(driveId: String? = nil) throws -> Int {
        var sql = """
        DELETE FROM assets
        WHERE rowid NOT IN (
            SELECT MIN(rowid) FROM assets GROUP BY drive_id, relative_path
        )
        """
        if let dId = driveId {
            let escaped = dId.replacingOccurrences(of: "'", with: "''")
            sql += " AND drive_id = '\(escaped)';"
        } else {
            sql += ";"
        }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }
        if sqlite3_step(stmt) != SQLITE_DONE { throw getLastError() }
        let deletedCount = Int(sqlite3_changes(db))

        if deletedCount > 0 {
            try? executeRaw("DELETE FROM assets_fts WHERE asset_id NOT IN (SELECT id FROM assets);")
            try? executeRaw("DELETE FROM album_assets WHERE asset_id NOT IN (SELECT id FROM assets);")
        }
        return deletedCount
    }

    public func pruneMissingAssets(driveId: String, validRelativePaths: Set<String>) throws -> Int {
        let sql = "SELECT id, relative_path, thumbnail_path, preview_path FROM assets WHERE drive_id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, (driveId as NSString).utf8String, -1, nil)

        var toDeleteIds: [String] = []
        var thumbsToDelete: [String] = []

        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(stmt, 0))
            let relPath = String(cString: sqlite3_column_text(stmt, 1))
            if !validRelativePaths.contains(relPath) {
                toDeleteIds.append(id)
                if let t = sqlite3_column_text(stmt, 2) {
                    thumbsToDelete.append(String(cString: t))
                }
                if let p = sqlite3_column_text(stmt, 3) {
                    thumbsToDelete.append(String(cString: p))
                }
            }
        }

        guard !toDeleteIds.isEmpty else { return 0 }

        // Clean up thumbnail / preview files
        for thumbName in thumbsToDelete {
            let tUrl = SystemPaths.thumbnailsDirectory.appendingPathComponent(thumbName)
            let pUrl = SystemPaths.previewsDirectory.appendingPathComponent(thumbName)
            try? FileManager.default.removeItem(at: tUrl)
            try? FileManager.default.removeItem(at: pUrl)
        }

        // Delete from DB in batches of 400
        var batchStart = 0
        while batchStart < toDeleteIds.count {
            let batchEnd = min(batchStart + 400, toDeleteIds.count)
            let chunk = Array(toDeleteIds[batchStart..<batchEnd])
            batchStart = batchEnd

            let placeholders = Array(repeating: "?", count: chunk.count).joined(separator: ",")

            // assets_fts
            let ftsSql = "DELETE FROM assets_fts WHERE asset_id IN (\(placeholders));"
            var ftsStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, ftsSql, -1, &ftsStmt, nil) == SQLITE_OK {
                for (i, id) in chunk.enumerated() {
                    sqlite3_bind_text(ftsStmt, Int32(i + 1), (id as NSString).utf8String, -1, nil)
                }
                _ = sqlite3_step(ftsStmt)
                sqlite3_finalize(ftsStmt)
            }

            // album_assets
            let albumSql = "DELETE FROM album_assets WHERE asset_id IN (\(placeholders));"
            var albumStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, albumSql, -1, &albumStmt, nil) == SQLITE_OK {
                for (i, id) in chunk.enumerated() {
                    sqlite3_bind_text(albumStmt, Int32(i + 1), (id as NSString).utf8String, -1, nil)
                }
                _ = sqlite3_step(albumStmt)
                sqlite3_finalize(albumStmt)
            }

            // assets
            let assetSql = "DELETE FROM assets WHERE id IN (\(placeholders));"
            var assetStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, assetSql, -1, &assetStmt, nil) == SQLITE_OK {
                for (i, id) in chunk.enumerated() {
                    sqlite3_bind_text(assetStmt, Int32(i + 1), (id as NSString).utf8String, -1, nil)
                }
                _ = sqlite3_step(assetStmt)
                sqlite3_finalize(assetStmt)
            }
        }

        return toDeleteIds.count
    }

    public func queryAssets(filter: AssetQueryFilter) throws -> (assets: [AssetRecord], total: Int) {
        var whereClauses: [String] = []
        var binds: [(Int, Any)] = []

        if let mt = filter.mediaType {
            whereClauses.append("a.media_type = ?")
            binds.append((binds.count + 1, mt.rawValue))
        }

        if let fav = filter.isFavorite {
            whereClauses.append("a.is_favorite = ?")
            binds.append((binds.count + 1, fav ? 1 : 0))
        }

        if let did = filter.driveId {
            whereClauses.append("a.drive_id = ?")
            binds.append((binds.count + 1, did))
        }

        if let alb = filter.albumId {
            if let smartRules = try? getSmartRules(albumId: alb) {
                applySmartRules(rules: smartRules, whereClauses: &whereClauses, binds: &binds)
            } else {
                whereClauses.append("a.id IN (SELECT asset_id FROM album_assets WHERE album_id = ?)")
                binds.append((binds.count + 1, alb))
            }
        }

        if let y = filter.year {
            whereClauses.append("strftime('%Y', COALESCE(a.date_taken, a.date_imported)) = ?")
            binds.append((binds.count + 1, String(y)))
        }

        if let c = filter.country, !c.isEmpty {
            whereClauses.append("a.country = ?")
            binds.append((binds.count + 1, c))
        }

        if let ct = filter.city, !ct.isEmpty {
            whereClauses.append("a.city = ?")
            binds.append((binds.count + 1, ct))
        }

        if let s = filter.startDate, !s.isEmpty {
            whereClauses.append("date(COALESCE(a.date_taken, a.date_imported)) >= date(?)")
            binds.append((binds.count + 1, s))
        }

        if let e = filter.endDate, !e.isEmpty {
            whereClauses.append("date(COALESCE(a.date_taken, a.date_imported)) <= date(?)")
            binds.append((binds.count + 1, e))
        }

        if let query = filter.searchQuery, !query.trimmingCharacters(in: .whitespaces).isEmpty {
            let cleanQuery = query.trimmingCharacters(in: .whitespaces)
            let escaped = cleanQuery.replacingOccurrences(of: "\"", with: "")
            let ftsQuery = "\"\(escaped)\"*"
            whereClauses.append("""
            (a.id IN (SELECT asset_id FROM assets_fts WHERE assets_fts MATCH ?) 
             OR a.original_filename LIKE ? 
             OR a.camera_model LIKE ?
             OR a.city LIKE ?
             OR a.state LIKE ?
             OR a.country LIKE ?
             OR a.place_name LIKE ?)
            """)
            binds.append((binds.count + 1, ftsQuery))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
            binds.append((binds.count + 1, "%\(cleanQuery)%"))
        }

        let whereString = whereClauses.isEmpty ? "" : "WHERE " + whereClauses.joined(separator: " AND ")

        // Count total
        let countSql = "SELECT COUNT(*) FROM assets a \(whereString);"
        var countStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, countSql, -1, &countStmt, nil) == SQLITE_OK else { throw getLastError() }

        for (idx, val) in binds {
            bindValue(stmt: countStmt, index: Int32(idx), value: val)
        }

        var total = 0
        if sqlite3_step(countStmt) == SQLITE_ROW {
            total = Int(sqlite3_column_int(countStmt, 0))
        }
        sqlite3_finalize(countStmt)

        // Query items
        let querySql = """
        SELECT a.id, a.drive_id, d.drive_name, a.original_filename, a.relative_path, a.file_extension, a.media_type, a.mime_type,
               a.file_size, a.checksum, a.date_taken, a.date_imported, a.modified_at, a.width, a.height, a.duration,
               a.latitude, a.longitude, a.altitude, a.camera_make, a.camera_model, a.lens_model, a.iso, a.focal_length,
               a.aperture, a.shutter_speed, a.is_favorite, a.thumbnail_path, a.preview_path, a.availability_status,
               a.city, a.state, a.country, a.place_name
        FROM assets a
        LEFT JOIN drives d ON a.drive_id = d.id
        \(whereString)
        ORDER BY COALESCE(a.date_taken, a.date_imported) DESC
        LIMIT ? OFFSET ?;
        """

        var queryStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, querySql, -1, &queryStmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(queryStmt) }

        for (idx, val) in binds {
            bindValue(stmt: queryStmt, index: Int32(idx), value: val)
        }
        let limitIdx = Int32(binds.count + 1)
        let offsetIdx = Int32(binds.count + 2)
        sqlite3_bind_int(queryStmt, limitIdx, Int32(filter.limit))
        sqlite3_bind_int(queryStmt, offsetIdx, Int32(filter.offset))

        var results: [AssetRecord] = []
        while sqlite3_step(queryStmt) == SQLITE_ROW {
            results.append(readAssetRow(stmt: queryStmt))
        }

        return (results, total)
    }

    public func updateAssetFavorite(id: String, isFavorite: Bool) throws {
        let sql = "UPDATE assets SET is_favorite = ? WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_int(stmt, 1, isFavorite ? 1 : 0)
        sqlite3_bind_text(stmt, 2, (id as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func updateAssetThumbnail(id: String, thumbnailPath: String?, previewPath: String?) throws {
        let sql = "UPDATE assets SET thumbnail_path = COALESCE(?, thumbnail_path), preview_path = COALESCE(?, preview_path) WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        if let tp = thumbnailPath { sqlite3_bind_text(stmt, 1, (tp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 1) }
        if let pp = previewPath { sqlite3_bind_text(stmt, 2, (pp as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 2) }
        sqlite3_bind_text(stmt, 3, (id as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    // MARK: - Album & Smart Collection Operations

    private func applySmartRules(rules: SmartAlbumRules, whereClauses: inout [String], binds: inout [(Int, Any)]) {
        if let y = rules.year {
            whereClauses.append("strftime('%Y', COALESCE(a.date_taken, a.date_imported)) = ?")
            binds.append((binds.count + 1, String(y)))
        }

        if let c = rules.country, !c.isEmpty {
            whereClauses.append("a.country = ?")
            binds.append((binds.count + 1, c))
        }

        if let ct = rules.city, !ct.isEmpty {
            whereClauses.append("a.city = ?")
            binds.append((binds.count + 1, ct))
        }

        if let s = rules.startDate, !s.isEmpty {
            whereClauses.append("date(COALESCE(a.date_taken, a.date_imported)) >= date(?)")
            binds.append((binds.count + 1, s))
        }

        if let e = rules.endDate, !e.isEmpty {
            whereClauses.append("date(COALESCE(a.date_taken, a.date_imported)) <= date(?)")
            binds.append((binds.count + 1, e))
        }

        if let mt = rules.mediaType {
            whereClauses.append("a.media_type = ?")
            binds.append((binds.count + 1, mt.rawValue))
        }

        if let fav = rules.isFavorite, fav {
            whereClauses.append("a.is_favorite = 1")
        }

        if let q = rules.searchQuery, !q.trimmingCharacters(in: .whitespaces).isEmpty {
            let clean = q.trimmingCharacters(in: .whitespaces)
            let escaped = clean.replacingOccurrences(of: "\"", with: "")
            let ftsQuery = "\"\(escaped)\"*"
            whereClauses.append("""
            (a.id IN (SELECT asset_id FROM assets_fts WHERE assets_fts MATCH ?) 
             OR a.original_filename LIKE ? 
             OR a.camera_model LIKE ?
             OR a.city LIKE ?
             OR a.country LIKE ?
             OR a.place_name LIKE ?)
            """)
            binds.append((binds.count + 1, ftsQuery))
            binds.append((binds.count + 1, "%\(clean)%"))
            binds.append((binds.count + 1, "%\(clean)%"))
            binds.append((binds.count + 1, "%\(clean)%"))
            binds.append((binds.count + 1, "%\(clean)%"))
            binds.append((binds.count + 1, "%\(clean)%"))
        }
    }

    public func createAlbum(_ album: AlbumRecord, rules: SmartAlbumRules? = nil) throws {
        let sql = "INSERT INTO albums (id, name, description, cover_asset_id, album_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (album.id as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (album.name as NSString).utf8String, -1, nil)
        if let desc = album.description { sqlite3_bind_text(stmt, 3, (desc as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 3) }
        if let cov = album.coverAssetId { sqlite3_bind_text(stmt, 4, (cov as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 4) }
        sqlite3_bind_text(stmt, 5, (album.albumType.rawValue as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 6, (album.createdAt as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 7, (album.updatedAt as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }

        if let r = rules {
            let rData = try JSONEncoder().encode(r)
            if let rString = String(data: rData, encoding: .utf8) {
                try saveSmartRules(albumId: album.id, rulesJson: rString)
            }
        } else if let rString = album.rulesJson {
            try saveSmartRules(albumId: album.id, rulesJson: rString)
        }
    }

    public func saveSmartRules(albumId: String, rulesJson: String) throws {
        let sql = """
        INSERT INTO smart_album_rules (id, album_id, rules_json)
        VALUES (?, ?, ?)
        ON CONFLICT(album_id) DO UPDATE SET rules_json = excluded.rules_json;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        let id = UUID().uuidString
        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (albumId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 3, (rulesJson as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func getSmartRules(albumId: String) throws -> SmartAlbumRules? {
        let sql = "SELECT rules_json FROM smart_album_rules WHERE album_id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (albumId as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) == SQLITE_ROW {
            let jsonStr = String(cString: sqlite3_column_text(stmt, 0))
            if let data = jsonStr.data(using: .utf8) {
                return try? JSONDecoder().decode(SmartAlbumRules.self, from: data)
            }
        }
        return nil
    }

    public func getAllAlbums() throws -> [AlbumRecord] {
        let sql = """
        SELECT al.id, al.name, al.description, al.cover_asset_id, al.album_type, al.created_at, al.updated_at,
               (SELECT COUNT(*) FROM album_assets WHERE album_id = al.id) as manual_count,
               a.thumbnail_path as cover_thumbnail,
               sr.rules_json
        FROM albums al
        LEFT JOIN assets a ON al.cover_asset_id = a.id
        LEFT JOIN smart_album_rules sr ON al.id = sr.album_id
        ORDER BY al.created_at DESC;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        var list: [AlbumRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(stmt, 0))
            let name = String(cString: sqlite3_column_text(stmt, 1))
            let desc = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
            var coverId = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
            let typeStr = String(cString: sqlite3_column_text(stmt, 4))
            let createdAt = String(cString: sqlite3_column_text(stmt, 5))
            let updatedAt = String(cString: sqlite3_column_text(stmt, 6))
            var count = Int(sqlite3_column_int(stmt, 7))
            let rulesJson = sqlite3_column_text(stmt, 9).map { String(cString: $0) }

            let albumType = AlbumType(rawValue: typeStr) ?? .manual

            // Dynamic count & cover for smart albums
            if albumType == .smart, let rJson = rulesJson, let data = rJson.data(using: .utf8),
               let rules = try? JSONDecoder().decode(SmartAlbumRules.self, from: data) {
                var wClauses: [String] = []
                var binds: [(Int, Any)] = []
                applySmartRules(rules: rules, whereClauses: &wClauses, binds: &binds)
                let wStr = wClauses.isEmpty ? "" : "WHERE " + wClauses.joined(separator: " AND ")

                // Dynamic Count
                let countSql = "SELECT COUNT(*) FROM assets a \(wStr);"
                var countStmt: OpaquePointer?
                if sqlite3_prepare_v2(db, countSql, -1, &countStmt, nil) == SQLITE_OK {
                    for (bIdx, bVal) in binds {
                        bindValue(stmt: countStmt, index: Int32(bIdx), value: bVal)
                    }
                    if sqlite3_step(countStmt) == SQLITE_ROW {
                        count = Int(sqlite3_column_int(countStmt, 0))
                    }
                    sqlite3_finalize(countStmt)
                }

                // Dynamic Cover Asset if not explicitly set
                if coverId == nil && count > 0 {
                    let coverSql = "SELECT a.id, a.thumbnail_path FROM assets a \(wStr) ORDER BY COALESCE(a.date_taken, a.date_imported) DESC LIMIT 1;"
                    var coverStmt: OpaquePointer?
                    if sqlite3_prepare_v2(db, coverSql, -1, &coverStmt, nil) == SQLITE_OK {
                        for (bIdx, bVal) in binds {
                            bindValue(stmt: coverStmt, index: Int32(bIdx), value: bVal)
                        }
                        if sqlite3_step(coverStmt) == SQLITE_ROW {
                            coverId = String(cString: sqlite3_column_text(coverStmt, 0))
                        }
                        sqlite3_finalize(coverStmt)
                    }
                }
            }

            list.append(AlbumRecord(
                id: id,
                name: name,
                description: desc,
                coverAssetId: coverId,
                coverThumbnailUrl: coverId != nil ? "/api/v1/assets/\(coverId!)/thumbnail" : nil,
                albumType: albumType,
                assetCount: count,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rulesJson: rulesJson
            ))
        }
        return list
    }

    public func autoGenerateCollections() throws -> [AlbumRecord] {
        // 1. Years
        let yearSql = """
        SELECT DISTINCT strftime('%Y', COALESCE(date_taken, date_imported)) as yr, COUNT(*) as cnt
        FROM assets
        WHERE yr IS NOT NULL AND yr != ''
        GROUP BY yr
        ORDER BY yr DESC;
        """
        var yearStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, yearSql, -1, &yearStmt, nil) == SQLITE_OK {
            while sqlite3_step(yearStmt) == SQLITE_ROW {
                if let yStr = sqlite3_column_text(yearStmt, 0).map({ String(cString: $0) }), let yInt = Int(yStr) {
                    let albumName = "\(yInt)"
                    if !albumExists(name: albumName, category: "year") {
                        let rules = SmartAlbumRules(category: "year", year: yInt)
                        let record = AlbumRecord(name: albumName, description: "All media from \(yInt)", albumType: .smart)
                        try createAlbum(record, rules: rules)
                    }
                }
            }
            sqlite3_finalize(yearStmt)
        }

        // 2. Countries
        let countrySql = """
        SELECT DISTINCT country, COUNT(*) as cnt
        FROM assets
        WHERE country IS NOT NULL AND country != ''
        GROUP BY country
        HAVING cnt >= 1
        ORDER BY cnt DESC;
        """
        var countryStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, countrySql, -1, &countryStmt, nil) == SQLITE_OK {
            while sqlite3_step(countryStmt) == SQLITE_ROW {
                if let cName = sqlite3_column_text(countryStmt, 0).map({ String(cString: $0) }) {
                    if !albumExists(name: cName, category: "country") {
                        let rules = SmartAlbumRules(category: "country", country: cName)
                        let record = AlbumRecord(name: cName, description: "Photos and videos from \(cName)", albumType: .smart)
                        try createAlbum(record, rules: rules)
                    }
                }
            }
            sqlite3_finalize(countryStmt)
        }

        // 3. Cities
        let citySql = """
        SELECT city, country, COUNT(*) as cnt
        FROM assets
        WHERE city IS NOT NULL AND city != ''
        GROUP BY city, country
        HAVING cnt >= 1
        ORDER BY cnt DESC;
        """
        var cityStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, citySql, -1, &cityStmt, nil) == SQLITE_OK {
            while sqlite3_step(cityStmt) == SQLITE_ROW {
                if let cityName = sqlite3_column_text(cityStmt, 0).map({ String(cString: $0) }) {
                    let countryName = sqlite3_column_text(cityStmt, 1).map({ String(cString: $0) })
                    if !albumExists(name: cityName, category: "city") {
                        let desc = countryName != nil ? "Captured in \(cityName), \(countryName!)" : "Captured in \(cityName)"
                        let rules = SmartAlbumRules(category: "city", country: countryName, city: cityName)
                        let record = AlbumRecord(name: cityName, description: desc, albumType: .smart)
                        try createAlbum(record, rules: rules)
                    }
                }
            }
            sqlite3_finalize(cityStmt)
        }

        // 4. Family Events (Birthdays & Anniversaries)
        _ = try? generateFamilyAlbums()

        return try getAllAlbums()
    }

    private func albumExists(name: String, category: String) -> Bool {
        let sql = """
        SELECT al.id FROM albums al
        JOIN smart_album_rules sr ON al.id = sr.album_id
        WHERE al.name = ? AND sr.rules_json LIKE ?;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return false }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, (name as NSString).utf8String, -1, nil)
        let pat = "%\"category\":\"\(category)\"%"
        sqlite3_bind_text(stmt, 2, (pat as NSString).utf8String, -1, nil)
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    public func getCollectionsMeta() throws -> CollectionsMeta {
        var years: [Int] = []
        let yrSql = "SELECT DISTINCT strftime('%Y', COALESCE(date_taken, date_imported)) as yr FROM assets WHERE yr IS NOT NULL AND yr != '' ORDER BY yr DESC;"
        var yrStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, yrSql, -1, &yrStmt, nil) == SQLITE_OK {
            while sqlite3_step(yrStmt) == SQLITE_ROW {
                if let yStr = sqlite3_column_text(yrStmt, 0).map({ String(cString: $0) }), let yInt = Int(yStr) {
                    years.append(yInt)
                }
            }
            sqlite3_finalize(yrStmt)
        }

        var countries: [CollectionsMeta.NamedCount] = []
        let cSql = "SELECT country, COUNT(*) as cnt FROM assets WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY cnt DESC;"
        var cStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, cSql, -1, &cStmt, nil) == SQLITE_OK {
            while sqlite3_step(cStmt) == SQLITE_ROW {
                if let name = sqlite3_column_text(cStmt, 0).map({ String(cString: $0) }) {
                    let cnt = Int(sqlite3_column_int(cStmt, 1))
                    countries.append(CollectionsMeta.NamedCount(name: name, count: cnt))
                }
            }
            sqlite3_finalize(cStmt)
        }

        var cities: [CollectionsMeta.NamedCount] = []
        let ctSql = "SELECT city, country, COUNT(*) as cnt FROM assets WHERE city IS NOT NULL AND city != '' GROUP BY city, country ORDER BY cnt DESC;"
        var ctStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, ctSql, -1, &ctStmt, nil) == SQLITE_OK {
            while sqlite3_step(ctStmt) == SQLITE_ROW {
                if let name = sqlite3_column_text(ctStmt, 0).map({ String(cString: $0) }) {
                    let cName = sqlite3_column_text(ctStmt, 1).map({ String(cString: $0) })
                    let cnt = Int(sqlite3_column_int(ctStmt, 2))
                    cities.append(CollectionsMeta.NamedCount(name: name, country: cName, count: cnt))
                }
            }
            sqlite3_finalize(ctStmt)
        }

        var countryGroups: [CollectionsMeta.CountryGroup] = []
        for country in countries {
            let countryCities = cities.filter { $0.country?.lowercased() == country.name.lowercased() }
            countryGroups.append(CollectionsMeta.CountryGroup(
                country: country.name,
                totalCount: country.count,
                cities: countryCities
            ))
        }

        return CollectionsMeta(years: years, countries: countries, cities: cities, countryGroups: countryGroups)
    }

    // MARK: - Family Event Operations

    public func createFamilyEvent(_ event: FamilyEventRecord) throws {
        let sql = """
        INSERT INTO family_events (id, person_name, event_type, event_date, window_days, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            person_name = excluded.person_name,
            event_type = excluded.event_type,
            event_date = excluded.event_date,
            window_days = excluded.window_days,
            notes = excluded.notes;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (event.id as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (event.personName as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 3, (event.eventType.rawValue as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 4, (event.eventDate as NSString).utf8String, -1, nil)
        sqlite3_bind_int(stmt, 5, Int32(event.windowDays))
        if let notes = event.notes {
            sqlite3_bind_text(stmt, 6, (notes as NSString).utf8String, -1, nil)
        } else {
            sqlite3_bind_null(stmt, 6)
        }
        sqlite3_bind_text(stmt, 7, (event.createdAt as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }

        // Auto-generate albums for this new/updated event across all library years
        _ = try? generateFamilyAlbums()
    }

    public func getAllFamilyEvents() throws -> [FamilyEventRecord] {
        let sql = "SELECT id, person_name, event_type, event_date, window_days, notes, created_at FROM family_events ORDER BY event_date ASC;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        var list: [FamilyEventRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(stmt, 0))
            let name = String(cString: sqlite3_column_text(stmt, 1))
            let typeStr = String(cString: sqlite3_column_text(stmt, 2))
            let dateStr = String(cString: sqlite3_column_text(stmt, 3))
            let window = Int(sqlite3_column_int(stmt, 4))
            let notes = sqlite3_column_text(stmt, 5).map { String(cString: $0) }
            let created = String(cString: sqlite3_column_text(stmt, 6))

            list.append(FamilyEventRecord(
                id: id,
                personName: name,
                eventType: FamilyEventType(rawValue: typeStr) ?? .birthday,
                eventDate: dateStr,
                windowDays: window,
                notes: notes,
                createdAt: created
            ))
        }
        return list
    }

    public func deleteFamilyEvent(id: String) throws {
        // Find the event first so we know what albums to delete
        let eventSql = "SELECT person_name, event_type FROM family_events WHERE id = ?;"
        var eStmt: OpaquePointer?
        var pName: String?
        var eType: String?
        if sqlite3_prepare_v2(db, eventSql, -1, &eStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(eStmt, 1, (id as NSString).utf8String, -1, nil)
            if sqlite3_step(eStmt) == SQLITE_ROW {
                pName = String(cString: sqlite3_column_text(eStmt, 0))
                eType = String(cString: sqlite3_column_text(eStmt, 1))
            }
            sqlite3_finalize(eStmt)
        }

        let delSql = "DELETE FROM family_events WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, delSql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) != SQLITE_DONE { throw getLastError() }

        // Remove generated event albums for this person
        if let person = pName, let type = eType {
            let pat = "%\"personName\":\"\(person)\"%"
            let typePat = "%\"eventType\":\"\(type)\"%"
            let albDelSql = """
            DELETE FROM albums WHERE id IN (
                SELECT album_id FROM smart_album_rules
                WHERE rules_json LIKE ? AND rules_json LIKE ?
            );
            """
            var aStmt: OpaquePointer?
            if sqlite3_prepare_v2(db, albDelSql, -1, &aStmt, nil) == SQLITE_OK {
                sqlite3_bind_text(aStmt, 1, (pat as NSString).utf8String, -1, nil)
                sqlite3_bind_text(aStmt, 2, (typePat as NSString).utf8String, -1, nil)
                _ = sqlite3_step(aStmt)
                sqlite3_finalize(aStmt)
            }
        }
    }

    private func computeEventDateWindow(eventDate: String, year: Int, windowDays: Int) -> (startDate: String, endDate: String)? {
        let parts = eventDate.split(separator: "-").map { String($0) }
        guard parts.count >= 2 else { return nil }
        let monthStr = parts.count == 3 ? parts[1] : parts[0]
        let dayStr = parts.count == 3 ? parts[2] : parts[1]
        guard let m = Int(monthStr), let d = Int(dayStr) else { return nil }

        var comp = DateComponents()
        comp.year = year
        comp.month = m
        comp.day = d
        let cal = Calendar.current
        guard let centerDate = cal.date(from: comp) else { return nil }

        let start = cal.date(byAdding: .day, value: -windowDays, to: centerDate) ?? centerDate
        let end = cal.date(byAdding: .day, value: windowDays, to: centerDate) ?? centerDate

        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone.current
        return (f.string(from: start), f.string(from: end))
    }

    public func generateFamilyAlbums() throws -> [AlbumRecord] {
        let events = try getAllFamilyEvents()
        guard !events.isEmpty else { return [] }

        // Get all distinct years in assets
        let yrSql = "SELECT DISTINCT strftime('%Y', COALESCE(date_taken, date_imported)) as yr FROM assets WHERE yr IS NOT NULL AND yr != '' ORDER BY yr DESC;"
        var yrStmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, yrSql, -1, &yrStmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(yrStmt) }

        var years: [Int] = []
        while sqlite3_step(yrStmt) == SQLITE_ROW {
            if let yStr = sqlite3_column_text(yrStmt, 0).map({ String(cString: $0) }), let yInt = Int(yStr) {
                years.append(yInt)
            }
        }

        for event in events {
            for year in years {
                guard let window = computeEventDateWindow(eventDate: event.eventDate, year: year, windowDays: event.windowDays) else {
                    continue
                }

                // Check if there are assets taken in that window
                let countSql = "SELECT COUNT(*) FROM assets WHERE date(COALESCE(date_taken, date_imported)) >= date(?) AND date(COALESCE(date_taken, date_imported)) <= date(?);"
                var countStmt: OpaquePointer?
                var matchCount = 0
                if sqlite3_prepare_v2(db, countSql, -1, &countStmt, nil) == SQLITE_OK {
                    sqlite3_bind_text(countStmt, 1, (window.startDate as NSString).utf8String, -1, nil)
                    sqlite3_bind_text(countStmt, 2, (window.endDate as NSString).utf8String, -1, nil)
                    if sqlite3_step(countStmt) == SQLITE_ROW {
                        matchCount = Int(sqlite3_column_int(countStmt, 0))
                    }
                    sqlite3_finalize(countStmt)
                }

                // Only create the album if matching photos exist for that year!
                guard matchCount > 0 else { continue }

                let typeTitle: String
                switch event.eventType {
                case .birthday:
                    typeTitle = "Birthday"
                case .anniversary:
                    typeTitle = "Anniversary"
                case .custom:
                    typeTitle = "Celebration"
                }

                let albumName = "\(event.personName)'s \(typeTitle) \(year)"
                if !albumExists(name: albumName, category: "event") {
                    let rules = SmartAlbumRules(
                        category: "event",
                        year: year,
                        startDate: window.startDate,
                        endDate: window.endDate,
                        eventType: event.eventType.rawValue,
                        personName: event.personName
                    )
                    let desc = "Photos from \(event.personName)'s \(typeTitle.lowercased()) celebration (\(window.startDate) – \(window.endDate))"
                    let record = AlbumRecord(name: albumName, description: desc, albumType: .smart)
                    try createAlbum(record, rules: rules)
                }
            }
        }

        return try getAllAlbums()
    }

    public func addAssetToAlbum(albumId: String, assetId: String) throws {
        let sql = "INSERT OR IGNORE INTO album_assets (album_id, asset_id, added_at) VALUES (?, ?, ?);"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        let now = ISO8601DateFormatter().string(from: Date())
        sqlite3_bind_text(stmt, 1, (albumId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (assetId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 3, (now as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }

        // Auto set cover if none exists
        try executeRaw("UPDATE albums SET cover_asset_id = '\(assetId)' WHERE id = '\(albumId)' AND cover_asset_id IS NULL;")
    }

    public func removeAssetFromAlbum(albumId: String, assetId: String) throws {
        let sql = "DELETE FROM album_assets WHERE album_id = ? AND asset_id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (albumId as NSString).utf8String, -1, nil)
        sqlite3_bind_text(stmt, 2, (assetId as NSString).utf8String, -1, nil)

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func deleteAlbum(id: String) throws {
        // Original assets are NEVER deleted
        let sql = "DELETE FROM albums WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    public func deleteDrive(id: String) throws {
        // 1. Delete associated FTS index entries
        let ftsSql = "DELETE FROM assets_fts WHERE rowid IN (SELECT rowid FROM assets WHERE drive_id = ?);"
        var ftsStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, ftsSql, -1, &ftsStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(ftsStmt, 1, (id as NSString).utf8String, -1, nil)
            sqlite3_step(ftsStmt)
            sqlite3_finalize(ftsStmt)
        }

        // 2. Delete associated assets from DB
        let assetSql = "DELETE FROM assets WHERE drive_id = ?;"
        var assetStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, assetSql, -1, &assetStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(assetStmt, 1, (id as NSString).utf8String, -1, nil)
            sqlite3_step(assetStmt)
            sqlite3_finalize(assetStmt)
        }

        // 3. Delete drive record
        let sql = "DELETE FROM drives WHERE id = ?;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, (id as NSString).utf8String, -1, nil)
        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    // MARK: - Helper Methods

    private func bindValue(stmt: OpaquePointer?, index: Int32, value: Any) {
        if let str = value as? String {
            sqlite3_bind_text(stmt, index, (str as NSString).utf8String, -1, nil)
        } else if let num = value as? Int {
            sqlite3_bind_int(stmt, index, Int32(num))
        }
    }

    private func readDriveRow(stmt: OpaquePointer?) -> DriveRecord {
        let id = String(cString: sqlite3_column_text(stmt, 0))
        let name = String(cString: sqlite3_column_text(stmt, 1))
        let vol = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
        let mount = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
        let fs = sqlite3_column_text(stmt, 4).map { String(cString: $0) }
        let total = sqlite3_column_int64(stmt, 5)
        let avail = sqlite3_column_int64(stmt, 6)
        let statusStr = String(cString: sqlite3_column_text(stmt, 7))
        let lastConn = String(cString: sqlite3_column_text(stmt, 8))
        let created = String(cString: sqlite3_column_text(stmt, 9))

        return DriveRecord(
            id: id,
            driveName: name,
            volumeUuid: vol,
            mountPath: mount,
            filesystemType: fs,
            totalCapacity: total,
            availableCapacity: avail,
            status: DriveStatus(rawValue: statusStr) ?? .disconnected,
            lastConnected: lastConn,
            createdAt: created
        )
    }

    private func readAssetRow(stmt: OpaquePointer?) -> AssetRecord {
        let id = String(cString: sqlite3_column_text(stmt, 0))
        let driveId = String(cString: sqlite3_column_text(stmt, 1))
        let driveName = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
        let origName = String(cString: sqlite3_column_text(stmt, 3))
        let relPath = String(cString: sqlite3_column_text(stmt, 4))
        let ext = String(cString: sqlite3_column_text(stmt, 5))
        let mediaType = MediaType(rawValue: String(cString: sqlite3_column_text(stmt, 6))) ?? .photo
        let mime = String(cString: sqlite3_column_text(stmt, 7))
        let size = sqlite3_column_int64(stmt, 8)
        let checksum = sqlite3_column_text(stmt, 9).map { String(cString: $0) }
        let dateTaken = sqlite3_column_text(stmt, 10).map { String(cString: $0) }
        let dateImported = String(cString: sqlite3_column_text(stmt, 11))
        let modAt = sqlite3_column_text(stmt, 12).map { String(cString: $0) }
        let width = Int(sqlite3_column_int(stmt, 13))
        let height = Int(sqlite3_column_int(stmt, 14))
        let dur = sqlite3_column_type(stmt, 15) != SQLITE_NULL ? sqlite3_column_double(stmt, 15) : nil
        let lat = sqlite3_column_type(stmt, 16) != SQLITE_NULL ? sqlite3_column_double(stmt, 16) : nil
        let lon = sqlite3_column_type(stmt, 17) != SQLITE_NULL ? sqlite3_column_double(stmt, 17) : nil
        let alt = sqlite3_column_type(stmt, 18) != SQLITE_NULL ? sqlite3_column_double(stmt, 18) : nil
        let cm = sqlite3_column_text(stmt, 19).map { String(cString: $0) }
        let cmd = sqlite3_column_text(stmt, 20).map { String(cString: $0) }
        let lm = sqlite3_column_text(stmt, 21).map { String(cString: $0) }
        let iso = sqlite3_column_type(stmt, 22) != SQLITE_NULL ? Int(sqlite3_column_int(stmt, 22)) : nil
        let fl = sqlite3_column_type(stmt, 23) != SQLITE_NULL ? sqlite3_column_double(stmt, 23) : nil
        let ap = sqlite3_column_type(stmt, 24) != SQLITE_NULL ? sqlite3_column_double(stmt, 24) : nil
        let ss = sqlite3_column_text(stmt, 25).map { String(cString: $0) }
        let isFav = sqlite3_column_int(stmt, 26) == 1
        let thumbPath = sqlite3_column_text(stmt, 27).map { String(cString: $0) }
        let prevPath = sqlite3_column_text(stmt, 28).map { String(cString: $0) }
        let avail = AvailabilityStatus(rawValue: String(cString: sqlite3_column_text(stmt, 29))) ?? .available
        let city = sqlite3_column_text(stmt, 30).map { String(cString: $0) }
        let state = sqlite3_column_text(stmt, 31).map { String(cString: $0) }
        let country = sqlite3_column_text(stmt, 32).map { String(cString: $0) }
        let placeName = sqlite3_column_text(stmt, 33).map { String(cString: $0) }

        return AssetRecord(
            id: id,
            driveId: driveId,
            driveName: driveName,
            originalFilename: origName,
            relativePath: relPath,
            fileExtension: ext,
            mediaType: mediaType,
            mimeType: mime,
            fileSize: size,
            checksum: checksum,
            dateTaken: dateTaken,
            dateImported: dateImported,
            modifiedAt: modAt,
            width: width,
            height: height,
            duration: dur,
            latitude: lat,
            longitude: lon,
            altitude: alt,
            cameraMake: cm,
            cameraModel: cmd,
            lensModel: lm,
            iso: iso,
            focalLength: fl,
            aperture: ap,
            shutterSpeed: ss,
            isFavorite: isFav,
            thumbnailPath: thumbPath,
            previewPath: prevPath,
            availabilityStatus: avail,
            city: city,
            state: state,
            country: country,
            placeName: placeName
        )
    }

    // MARK: - Geo Cache Operations

    public func getCachedGeo(latitude: Double, longitude: Double) throws -> (city: String?, state: String?, country: String?, placeName: String?)? {
        let roundedLat = (latitude * 100).rounded() / 100
        let roundedLon = (longitude * 100).rounded() / 100
        let sql = "SELECT city, state, country, place_name FROM geo_cache WHERE rounded_lat = ? AND rounded_lon = ? LIMIT 1;"
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, roundedLat)
        sqlite3_bind_double(stmt, 2, roundedLon)

        if sqlite3_step(stmt) == SQLITE_ROW {
            let city = sqlite3_column_text(stmt, 0).map { String(cString: $0) }
            let state = sqlite3_column_text(stmt, 1).map { String(cString: $0) }
            let country = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
            let placeName = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
            return (city, state, country, placeName)
        }
        return nil
    }

    public func saveCachedGeo(latitude: Double, longitude: Double, city: String?, state: String?, country: String?, placeName: String?) throws {
        let roundedLat = (latitude * 100).rounded() / 100
        let roundedLon = (longitude * 100).rounded() / 100
        let sql = """
        INSERT INTO geo_cache (rounded_lat, rounded_lon, city, state, country, place_name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(rounded_lat, rounded_lon) DO UPDATE SET
            city = excluded.city,
            state = excluded.state,
            country = excluded.country,
            place_name = excluded.place_name;
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { throw getLastError() }
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_double(stmt, 1, roundedLat)
        sqlite3_bind_double(stmt, 2, roundedLon)
        if let c = city { sqlite3_bind_text(stmt, 3, (c as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 3) }
        if let s = state { sqlite3_bind_text(stmt, 4, (s as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 4) }
        if let cn = country { sqlite3_bind_text(stmt, 5, (cn as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 5) }
        if let p = placeName { sqlite3_bind_text(stmt, 6, (p as NSString).utf8String, -1, nil) } else { sqlite3_bind_null(stmt, 6) }

        if sqlite3_step(stmt) != SQLITE_DONE {
            throw getLastError()
        }
    }

    private func getLastError() -> NSError {
        let msg = String(cString: sqlite3_errmsg(db))
        let code = sqlite3_errcode(db)
        return NSError(domain: "SQLite", code: Int(code), userInfo: [NSLocalizedDescriptionKey: msg])
    }
}
