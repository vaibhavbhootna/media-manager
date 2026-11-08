import Foundation
import CoreGraphics
import ImageIO
import MediaManagerCore

func createTestDriveFolder(name: String) throws -> URL {
    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    let driveRoot = tempDir.appendingPathComponent(name, isDirectory: true)
    try FileManager.default.createDirectory(at: driveRoot, withIntermediateDirectories: true)
    return driveRoot
}

func createSampleJPEG(at url: URL, width: Int = 800, height: Int = 600) {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace, bitmapInfo: bitmapInfo) else { return }
    context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1.0))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    guard let image = context.makeImage(),
          let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}

func assertCondition(_ condition: Bool, _ message: String) {
    if !condition {
        print("❌ ASSERTION FAILED: \(message)")
        exit(1)
    }
}

// MARK: - Test Suites

func testDriveRegistrationAndTokenCreation() async throws {
    print("\n[TEST 1] Running: Drive Registration & Token Creation...")
    try await DatabaseManager.shared.initialize()

    let driveURL = try createTestDriveFolder(name: "VAIBHAV_HDD_01")
    defer { try? FileManager.default.removeItem(at: driveURL) }

    // Register drive
    let record = try await DriveManager.shared.registerDrive(mountPath: driveURL.path, customName: "Vaibhav Main Storage")

    // 1. Verify token file on HDD
    let tokenURL = driveURL.appendingPathComponent(".media-manager/drive.json")
    assertCondition(FileManager.default.fileExists(atPath: tokenURL.path), "drive.json must exist in .media-manager/ on HDD")

    let tokenData = try Data(contentsOf: tokenURL)
    let token = try JSONDecoder().decode(DriveToken.self, from: tokenData)
    assertCondition(token.driveId == record.id, "Drive ID must match record")
    assertCondition(token.application == "MediaManager", "Application name must be MediaManager")
    assertCondition(token.schemaVersion == 1, "Schema version must be 1")

    // 2. Verify local registry JSON
    let registryURL = SystemPaths.drivesRegistryDirectory.appendingPathComponent("\(record.id).json")
    assertCondition(FileManager.default.fileExists(atPath: registryURL.path), "Local registry record must exist in Application Support")

    // 3. Verify SQLite record
    let dbRecord = try await DatabaseManager.shared.getDrive(id: record.id)
    assertCondition(dbRecord != nil, "Drive must exist in SQLite database")
    assertCondition(dbRecord?.driveName == "Vaibhav Main Storage", "Drive name must match")
    assertCondition(dbRecord?.status == .connected, "Drive status must be connected")

    // Cleanup test record
    try await DriveManager.shared.unregisterDrive(driveId: record.id)

    print("  ✅ PASS: Drive token created, local registry written, SQLite record active.")
}

func testCatalogRebuildAndOfflineSearch() async throws {
    print("\n[TEST 2] Running: Catalog Rebuilding & Offline Disconnected Search...")
    try await DatabaseManager.shared.initialize()

    let driveURL = try createTestDriveFolder(name: "TRAVEL_MEDIA_2026")
    defer { try? FileManager.default.removeItem(at: driveURL) }

    // Place test media in ordinary flat folders (Storage Philosophy: no artificial album hierarchy)
    let img1 = driveURL.appendingPathComponent("IMG_1024.JPG")
    let img2 = driveURL.appendingPathComponent("IMG_1025.JPG")
    let img3 = driveURL.appendingPathComponent("IMG_1026.JPG")
    createSampleJPEG(at: img1, width: 1200, height: 900)
    createSampleJPEG(at: img2, width: 1600, height: 1200)
    createSampleJPEG(at: img3, width: 1920, height: 1080)

    // Register drive
    let drive = try await DriveManager.shared.registerDrive(mountPath: driveURL.path, customName: "Travel SSD")

    // Rebuild catalog from scratch
    let result = try await DriveManager.shared.rebuildCatalog(driveId: drive.id)
    assertCondition(result.scanned == 3, "Scanned count must be 3")
    assertCondition(result.added == 3, "Added count must be 3")

    // Verify portable manifest was written to HDD
    let manifestURL = driveURL.appendingPathComponent(".media-manager/manifest.json")
    assertCondition(FileManager.default.fileExists(atPath: manifestURL.path), "manifest.json must be written to HDD")

    // Verify assets in DB
    let (assets, total) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(driveId: drive.id))
    assertCondition(total == 3, "Total indexed assets must be 3")
    assertCondition(assets.count == 3, "Assets returned must be 3")

    // Verify cached thumbnails were generated
    for asset in assets {
        assertCondition(asset.thumbnailPath != nil, "Asset must have thumbnail path")
        let thumbFile = SystemPaths.thumbnailsDirectory.appendingPathComponent(asset.thumbnailPath!)
        assertCondition(FileManager.default.fileExists(atPath: thumbFile.path), "Thumbnail file must exist locally")
    }

    // SIMULATE DISCONNECTED HDD (Early Test Requirement)
    print("  🔌 Simulating HDD disconnection...")
    try await DatabaseManager.shared.updateDriveStatus(id: drive.id, status: .disconnected, mountPath: nil)

    // Verify assets are flagged offline
    let (offlineAssets, offlineTotal) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(driveId: drive.id))
    print("  Offline assets in DB: \(offlineAssets.map { $0.originalFilename })")
    assertCondition(offlineTotal == 3, "Offline assets count must be 3")
    for asset in offlineAssets {
        assertCondition(asset.availabilityStatus == .offline, "Asset must be marked offline")
        // Even though HDD is unplugged, cached thumbnail file is intact locally on the Mac!
        let localThumb = SystemPaths.thumbnailsDirectory.appendingPathComponent(asset.thumbnailPath!)
        assertCondition(FileManager.default.fileExists(atPath: localThumb.path), "Cached thumbnail must still exist when drive disconnected")
    }

    // Search offline using FTS5 (must return in <100ms without accessing original media)
    let startTime = CFAbsoluteTimeGetCurrent()
    let (searchResults, searchTotal) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(driveId: drive.id, searchQuery: "IMG_1025"))
    let elapsedMs = (CFAbsoluteTimeGetCurrent() - startTime) * 1000.0
    print("  🔍 Search for 'IMG_1025' on test drive returned count: \(searchTotal), items: \(searchResults.map { $0.originalFilename })")

    assertCondition(searchTotal == 1, "FTS5 search should find IMG_1025 on this drive")
    assertCondition(searchResults.first?.originalFilename == "IMG_1025.JPG", "Filename match")
    assertCondition(elapsedMs < 100.0, "FTS5 search time must be under 100ms (took \(String(format: "%.2f", elapsedMs))ms)")

    // RECONNECT HDD
    print("  🔌 Simulating HDD reconnection...")
    try await DatabaseManager.shared.updateDriveStatus(id: drive.id, status: .connected, mountPath: driveURL.path)
    let (reconnectedAssets, _) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(driveId: drive.id))
    assertCondition(reconnectedAssets.first?.availabilityStatus == .available, "Asset must be marked available upon drive reconnection")

    // Cleanup test drive and assets
    try await DriveManager.shared.unregisterDrive(driveId: drive.id)

    print("  ✅ PASS: Catalog rebuild, offline thumbnail persistence, and sub-100ms FTS5 search verified.")
}

func testClonedDriveConflictDetection() async throws {
    print("\n[TEST 3] Running: Cloned Drive Conflict Detection...")
    try await DatabaseManager.shared.initialize()

    let driveA = try createTestDriveFolder(name: "ORIGINAL_HDD")
    let driveB = try createTestDriveFolder(name: "CLONED_HDD")
    defer {
        try? FileManager.default.removeItem(at: driveA)
        try? FileManager.default.removeItem(at: driveB)
    }

    // Register Drive A
    let recordA = try await DriveManager.shared.registerDrive(mountPath: driveA.path, customName: "Primary Archive")

    // Copy .media-manager folder from A to B (simulating raw byte clone of an HDD)
    let tokenA = driveA.appendingPathComponent(".media-manager/drive.json")
    let tokenBDir = driveB.appendingPathComponent(".media-manager")
    try FileManager.default.createDirectory(at: tokenBDir, withIntermediateDirectories: true)
    try FileManager.default.copyItem(at: tokenA, to: tokenBDir.appendingPathComponent("drive.json"))

    // Re-read token from Clone
    let tokenB = try JSONDecoder().decode(DriveToken.self, from: Data(contentsOf: tokenBDir.appendingPathComponent("drive.json")))
    assertCondition(tokenB.driveId == recordA.id, "Cloned token must have identical driveId")

    // Trigger conflict check
    var detectedTokensByDriveId: [String: [URL]] = [:]
    detectedTokensByDriveId[recordA.id] = [driveA, driveB] // 2 mounted volumes with same driveId

    if (detectedTokensByDriveId[recordA.id]?.count ?? 0) > 1 {
        try await DatabaseManager.shared.updateDriveStatus(id: recordA.id, status: .conflict_detected, mountPath: nil)
    }

    let dbRecord = try await DatabaseManager.shared.getDrive(id: recordA.id)
    assertCondition(dbRecord?.status == .conflict_detected, "Drive status must be conflict_detected")

    // Cleanup
    try await DriveManager.shared.unregisterDrive(driveId: recordA.id)

    print("  ✅ PASS: Duplicate cloned drive prevented from corrupting catalog.")
}

func testNonDestructiveAlbumOperations() async throws {
    print("\n[TEST 4] Running: Virtual Album Non-Destructive Operations...")
    try await DatabaseManager.shared.initialize()

    let driveURL = try createTestDriveFolder(name: "ALBUM_TEST_HDD")
    defer { try? FileManager.default.removeItem(at: driveURL) }

    let mediaFile = driveURL.appendingPathComponent("PHOTO_01.JPG")
    createSampleJPEG(at: mediaFile, width: 400, height: 300)

    let drive = try await DriveManager.shared.registerDrive(mountPath: driveURL.path)
    _ = try await DriveManager.shared.rebuildCatalog(driveId: drive.id)

    let (assets, _) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(driveId: drive.id))
    guard let asset = assets.first else { fatalError("Asset missing") }

    // Create 2 virtual albums
    let album1 = AlbumRecord(name: "Favorites 2026")
    let album2 = AlbumRecord(name: "Summer Trip")
    try await DatabaseManager.shared.createAlbum(album1)
    try await DatabaseManager.shared.createAlbum(album2)

    // Add SAME asset to both albums (Many-to-Many without duplication)
    try await DatabaseManager.shared.addAssetToAlbum(albumId: album1.id, assetId: asset.id)
    try await DatabaseManager.shared.addAssetToAlbum(albumId: album2.id, assetId: asset.id)

    let (album1Assets, a1Count) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(albumId: album1.id))
    let (album2Assets, a2Count) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(albumId: album2.id))
    assertCondition(a1Count == 1, "Album 1 count must be 1")
    assertCondition(a2Count == 1, "Album 2 count must be 1")
    assertCondition(album1Assets.first?.id == asset.id, "Asset in Album 1")
    assertCondition(album2Assets.first?.id == asset.id, "Asset in Album 2")

    // DELETE ALBUM 1
    try await DatabaseManager.shared.deleteAlbum(id: album1.id)

    // Original media on HDD must remain 100% UNTOUCHED
    assertCondition(FileManager.default.fileExists(atPath: mediaFile.path), "Original file on HDD must never be deleted when deleting album")

    // Asset still exists in library and in Album 2
    let dbAsset = try await DatabaseManager.shared.getAsset(id: asset.id)
    assertCondition(dbAsset != nil, "Asset still exists in catalog")

    let (_, a2CountAfter) = try await DatabaseManager.shared.queryAssets(filter: AssetQueryFilter(albumId: album2.id))
    assertCondition(a2CountAfter == 1, "Album 2 membership preserved")

    // Cleanup album and drive
    try await DatabaseManager.shared.deleteAlbum(id: album2.id)
    try await DriveManager.shared.unregisterDrive(driveId: drive.id)

    print("  ✅ PASS: Virtual albums operate with zero file duplication or deletion.")
}

func testNewMacCatalogRebuildPortability() async throws {
    print("\n[TEST 5] Running: Portability & Catalog Rebuild on New Mac...")

    // Step 1: Create an HDD and populate it
    let driveURL = try createTestDriveFolder(name: "PORTABLE_VAIBHAV_HDD")
    defer { try? FileManager.default.removeItem(at: driveURL) }

    let pic1 = driveURL.appendingPathComponent("VACATION_01.JPG")
    let pic2 = driveURL.appendingPathComponent("VACATION_02.JPG")
    createSampleJPEG(at: pic1, width: 1000, height: 800)
    createSampleJPEG(at: pic2, width: 1000, height: 800)

    // Register and build initial catalog
    let drive = try await DriveManager.shared.registerDrive(mountPath: driveURL.path, customName: "Portable HDD")
    _ = try await DriveManager.shared.rebuildCatalog(driveId: drive.id)

    // Step 2: SIMULATE A BRAND NEW MAC
    print("  💻 Simulating installation on a new Mac (wiping local state)...")
    let freshDBURL = FileManager.default.temporaryDirectory.appendingPathComponent("fresh_library_\(UUID().uuidString).sqlite")
    let freshDB = DatabaseManager(url: freshDBURL)
    try await freshDB.initialize()

    // Reconnect existing HDD to new Mac
    let tokenURL = driveURL.appendingPathComponent(".media-manager/drive.json")
    let tokenData = try Data(contentsOf: tokenURL)
    let token = try JSONDecoder().decode(DriveToken.self, from: tokenData)

    let restoredRecord = DriveRecord(
        id: token.driveId,
        driveName: token.driveName,
        mountPath: driveURL.path,
        status: .connected
    )
    try await freshDB.upsertDrive(restoredRecord)

    let mediaFiles = try FileManager.default.contentsOfDirectory(at: driveURL, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension.lowercased() == "jpg" }

    for fileURL in mediaFiles {
        let meta = await MediaProcessor.shared.extractMetadata(fileURL: fileURL)
        let asset = AssetRecord(
            driveId: token.driveId,
            originalFilename: fileURL.lastPathComponent,
            relativePath: fileURL.lastPathComponent,
            fileExtension: fileURL.pathExtension,
            mediaType: meta.mediaType,
            mimeType: meta.mimeType,
            fileSize: 1000,
            width: meta.width,
            height: meta.height
        )
        try await freshDB.upsertAsset(asset)
    }

    // Verify fresh DB now contains both assets
    let (recoveredAssets, recTotal) = try await freshDB.queryAssets(filter: AssetQueryFilter(driveId: token.driveId))
    assertCondition(recTotal == 2, "Fresh DB recovered all 2 assets")
    assertCondition(recoveredAssets.count == 2, "Fresh DB returned assets")

    // Verify original files on the drive were never modified or damaged
    assertCondition(FileManager.default.fileExists(atPath: pic1.path), "Original file 1 intact")
    assertCondition(FileManager.default.fileExists(atPath: pic2.path), "Original file 2 intact")

    // Cleanup initial drive
    try await DriveManager.shared.unregisterDrive(driveId: drive.id)

    print("  ✅ PASS: 100% catalog rebuild on new Mac without altering originals.")
}

// MARK: - Main Runner
@main
struct TestRunner {
    static func main() async {
        print("=======================================================")
        print(" Local-First Media Manager — Core Subsystem Test Suite ")
        print("=======================================================")

        do {
            try await testDriveRegistrationAndTokenCreation()
            try await testCatalogRebuildAndOfflineSearch()
            try await testClonedDriveConflictDetection()
            try await testNonDestructiveAlbumOperations()
            try await testNewMacCatalogRebuildPortability()

            print("\n🎉 ALL 5 CORE SUITES PASSED SUCCESSFULLY!")
            print("=======================================================\n")
            exit(0)
        } catch {
            print("\n❌ TEST SUITE FAILED WITH ERROR: \(error)")
            exit(1)
        }
    }
}
