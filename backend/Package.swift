// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "backend",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "MediaManagerCore", targets: ["MediaManagerCore"]),
        .executable(name: "backend", targets: ["backend"]),
        .executable(name: "test-runner", targets: ["test-runner"]),
    ],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird.git", from: "2.5.0"),
        .package(url: "https://github.com/hummingbird-project/hummingbird-websocket.git", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "MediaManagerCore",
            dependencies: [
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "HummingbirdWebSocket", package: "hummingbird-websocket"),
            ],
            path: "Sources/MediaManagerCore"
        ),
        .executableTarget(
            name: "backend",
            dependencies: [
                "MediaManagerCore",
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "HummingbirdWebSocket", package: "hummingbird-websocket"),
            ],
            path: "Sources/backend"
        ),
        .executableTarget(
            name: "test-runner",
            dependencies: [
                "MediaManagerCore",
            ],
            path: "Tests/test-runner"
        ),
    ]
)
