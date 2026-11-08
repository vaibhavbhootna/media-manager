import Foundation
import Hummingbird
import HummingbirdWebSocket
import NIOCore
import WSCore

public actor WebSocketHub {
    public static let shared = WebSocketHub()

    private var clients: [UUID: WebSocketOutboundWriter] = [:]

    public init() {}

    public func addClient(id: UUID, outbound: WebSocketOutboundWriter) {
        clients[id] = outbound
    }

    public func removeClient(id: UUID) {
        clients.removeValue(forKey: id)
    }

    public func broadcast(event: String, data: [String: Any]) {
        var envelope: [String: Any] = [
            "event": event,
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]
        envelope["data"] = data

        guard let jsonData = try? JSONSerialization.data(withJSONObject: envelope),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }

        for (id, client) in clients {
            Task {
                do {
                    try await client.write(.text(jsonString))
                } catch {
                    await self.removeClient(id: id)
                }
            }
        }
    }
}
