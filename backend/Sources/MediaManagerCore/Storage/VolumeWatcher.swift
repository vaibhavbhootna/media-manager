import Foundation
import AppKit

public final class VolumeWatcher: @unchecked Sendable {
    public static let shared = VolumeWatcher()

    private var mountObserver: NSObjectProtocol?
    private var unmountObserver: NSObjectProtocol?
    public var onVolumeChange: (@Sendable () -> Void)?

    private init() {}

    public func start() {
        let center = NSWorkspace.shared.notificationCenter

        mountObserver = center.addObserver(
            forName: NSWorkspace.didMountNotification,
            object: nil,
            queue: .main
        ) { [weak self] notif in
            guard let self = self else { return }
            Task {
                _ = try? await DriveManager.shared.syncMountedVolumes()
                self.onVolumeChange?()
            }
        }

        unmountObserver = center.addObserver(
            forName: NSWorkspace.didUnmountNotification,
            object: nil,
            queue: .main
        ) { [weak self] notif in
            guard let self = self else { return }
            Task {
                _ = try? await DriveManager.shared.syncMountedVolumes()
                self.onVolumeChange?()
            }
        }
    }

    public func stop() {
        if let obs = mountObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
            mountObserver = nil
        }
        if let obs = unmountObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
            unmountObserver = nil
        }
    }
}
