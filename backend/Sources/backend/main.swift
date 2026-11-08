import Foundation
import Hummingbird
import HummingbirdWebSocket
import Logging
import MediaManagerCore

@main
struct MediaManagerBackend {
    static func main() async throws {
        var logger = Logger(label: "com.mediamanager.backend")
        logger.logLevel = .info

        logger.info("Initializing Local-First Media Manager backend...")

        // 1. Initialize SQLite Database & Schema
        try await DatabaseManager.shared.initialize()
        logger.info("SQLite database initialized at \(SystemPaths.databaseURL.path)")

        // 2. Discover and sync currently mounted external drives
        _ = try? await DriveManager.shared.syncMountedVolumes()

        // 3. Start mount/unmount watcher
        VolumeWatcher.shared.start()
        logger.info("External volume watcher active")

        // 4. Configure HTTP and WebSocket Router
        let apiServer = APIServer()
        let router = apiServer.buildRouter()

        let app = Application(
            router: router,
            server: .http1WebSocketUpgrade(webSocketRouter: router),
            configuration: .init(address: .hostname("127.0.0.1", port: 8080)),
            logger: logger
        )

        logger.info("Media Manager backend listening on http://127.0.0.1:8080")
        try await app.runService()
    }
}
