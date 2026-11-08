# MediaManager 📸

> **Modern local media catalog, photo organizer, and self-hosted personal cloud.**  
> High-performance Swift backend (Hummingbird + SQLite) paired with a responsive React 19 + TypeScript + Tailwind virtualized UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/Platform-macOS%2014%2B-black.svg)](https://apple.com/macos)
[![Swift: 6.0](https://img.shields.io/badge/Swift-6.0-orange.svg)](https://swift.org)
[![React: 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)

---

## Highlights

- ⚡ **Native Swift Core**: Powered by [Hummingbird 2.5](https://github.com/hummingbird-project/hummingbird) (Swift Concurrency & WebSockets) for lightning-fast asset streaming and low memory footprint.
- 🖼️ **Virtualized Infinite Grid**: High-performance photo and video browsing powered by `@tanstack/react-virtual` — smooth 60fps scrolling over tens of thousands of media files.
- 💾 **Multi-Drive Architecture**: Auto-detects external drives (USB-C, Thunderbolt, ExFAT/APFS), monitors mount/unmount events via macOS system notifications, and tracks storage allocation across volumes.
- 📱 **iOS Device Integration**: Direct detection of connected iPhones/iPads with zero vendor lock-in.
- 🔄 **Real-Time WebSocket Events**: Instant UI updates when external volumes mount, background indexing completes, or new media is ingested.
- 📍 **Smart Tagging & Geolocation**: Built-in reverse geocoding, EXIF camera extraction, and date-based timeline grouping.
- 🔒 **100% Local & Private**: No third-party clouds, recurring subscriptions, or external telemetry. Your memories stay strictly on your local hardware.

---

## Architecture

```
media-manager/
├── backend/                   # Swift Backend (Hummingbird 2.5)
│   ├── Package.swift          # SPM Manifest (macOS 14+, Swift 6.0)
│   ├── Sources/
│   │   ├── MediaManagerCore/  # Core Library
│   │   │   ├── Database/      # SQLite storage & indexing engine
│   │   │   ├── Devices/       # iOS USB device discovery
│   │   │   ├── Media/         # EXIF metadata parser & GeoService
│   │   │   ├── Models/        # Asset, Drive, Album data models
│   │   │   ├── Server/        # REST API & WebSocket broadcast hub
│   │   │   └── Storage/       # VolumeWatcher & FileSystemManager
│   │   └── backend/           # Entry point & CLI launcher
│   └── Tests/                 # Test suites & test runner
│
├── frontend/                  # React 19 + TypeScript Frontend
│   ├── src/
│   │   ├── components/        # MediaGrid, DrivesView, Sidebar, Modals
│   │   ├── services/          # HTTP API client & WebSocket listener
│   │   ├── store/             # Zustand reactive state store
│   │   └── types/             # TypeScript data contracts
│   ├── vite.config.ts         # Vite build configuration
│   └── tailwind.config.js     # Tailwind CSS design system
│
└── scripts/                   # Workflow management scripts
    ├── dev.sh                 # Start both backend & frontend in dev mode
    ├── start.sh               # Run backend and frontend as background daemons
    ├── stop.sh                # Gracefully stop all active servers
    └── test.sh                # Run backend test suites
```

---

## Quick Start

### Prerequisites
- macOS 14.0 (Sonoma) or newer
- Swift 6.0+ toolchain (`xcode-select --install` or Xcode 16+)
- Node.js 18+ & npm

### Development Mode
To launch both the Swift backend (port `8080`) and Vite frontend (port `3000`) concurrently with live reload:

```bash
./scripts/dev.sh
```

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://127.0.0.1:8080](http://127.0.0.1:8080)

### Background Daemon Mode
To compile the production build and run both services in the background:

```bash
# Start background services
./scripts/start.sh

# Stop background services
./scripts/stop.sh
```

---

## API & WebSocket Endpoints

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/api/assets` | Paginated asset stream with date/camera filters |
| `GET` | `/api/drives` | Connected storage drives and indexing status |
| `POST` | `/api/drives/register` | Register an external volume for indexing |
| `GET` | `/api/albums` | User-curated and auto-generated collections |
| `WS` | `/ws` | Real-time events (`drive_mounted`, `index_progress`, etc.) |

---

## Complementary Tools

- [`vaibhavbhootna/iphone-auto-backup`](https://github.com/vaibhavbhootna/iphone-auto-backup): Automated background daemon that auto-detects iPhone USB connections, deduplicates media using partial SHA-1 hashes, and archives directly into drive folders.
- [`vaibhavbhootna/agent-storage-rules`](https://github.com/vaibhavbhootna/agent-storage-rules): Agentic storage guidelines, prompt rules, and preflight deduplication checks for external hard drives.

---

## License

This project is licensed under the [MIT License](LICENSE) © 2026 Vaibhav Bhootna.
