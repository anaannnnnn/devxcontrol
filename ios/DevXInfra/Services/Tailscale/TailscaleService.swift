import Foundation
import Observation

/// Tailscale inventory via the management backend (`/api/v1/infra/tailscale/*`).
/// Does not embed Tailscale API keys. When the endpoint is absent, reports an honest blocked state.
@Observable
@MainActor
final class TailscaleService {
    private let api: ControlAPIClient
    private let session: SessionStore

    var devices: [InfraDevice] = []
    var isConnected = false
    var isLoading = false
    var lastError: String?
    var blockedReason: String?

    init(api: ControlAPIClient, session: SessionStore) {
        self.api = api
        self.session = session
    }

    func refresh() async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        guard session.isAuthenticated else {
            devices = []
            isConnected = false
            blockedReason = "Sign in to the control backend to load Tailscale devices."
            return
        }

        do {
            _ = try await api.baseURL()
        } catch {
            devices = []
            isConnected = false
            blockedReason = ConnectionRequirement.controlBackend.rawValue
            lastError = error.localizedDescription
            return
        }

        do {
            let data = try await api.get(path: "infra/tailscale/devices")
            struct Envelope: Decodable {
                var devices: [DeviceDTO]
                var connected: Bool?
                var reason: String?
            }
            struct DeviceDTO: Decodable {
                var id: String
                var name: String
                var os: String?
                var osVersion: String?
                var addresses: [String]?
                var magicDns: String?
                var status: String?
                var lastSeenAt: Date?
                var appsCount: Int?
                var publishedCount: Int?
                var agent: AgentDTO?
            }
            struct AgentDTO: Decodable {
                var enrolled: Bool?
                var capabilities: [String]?
            }
            let env = try await api.decode(Envelope.self, from: data)
            devices = env.devices.map { d in
                InfraDevice(
                    id: d.id,
                    name: d.name,
                    os: OsFamily(rawValue: d.os ?? "other") ?? .other,
                    osVersion: d.osVersion,
                    addresses: d.addresses ?? [],
                    magicDns: d.magicDns,
                    status: DeviceStatus(rawValue: d.status ?? "unknown") ?? .unknown,
                    lastSeenAt: d.lastSeenAt,
                    appsCount: d.appsCount,
                    publishedCount: d.publishedCount,
                    agentEnrolled: d.agent?.enrolled == true,
                    agentCapabilities: d.agent?.capabilities ?? []
                )
            }
            isConnected = env.connected ?? !env.devices.isEmpty
            if env.connected == false {
                blockedReason = env.reason ?? ConnectionRequirement.tailscaleAPI.rawValue
            } else {
                blockedReason = nil
            }
        } catch InfraError.backend(let msg) where msg.localizedCaseInsensitiveContains("not found")
            || msg.contains("404") {
            devices = []
            isConnected = false
            blockedReason = "Tailscale proxy is not enabled on this control backend yet (`/api/v1/infra/tailscale/devices`). \(ConnectionRequirement.tailscaleAPI)."
        } catch InfraError.notConfigured(let req) {
            devices = []
            isConnected = false
            blockedReason = req.rawValue
        } catch {
            // Endpoint may literally 404 as HTML/problem — treat as unavailable, not fake data.
            devices = []
            isConnected = false
            blockedReason = "Could not load Tailscale devices. \(error.localizedDescription)"
            lastError = error.localizedDescription
        }
    }

    var onlineCount: Int { devices.filter { $0.status == .online }.count }
}
