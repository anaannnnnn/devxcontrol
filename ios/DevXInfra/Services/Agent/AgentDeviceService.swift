import Foundation
import Observation

struct RemoteContainer: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var name: String
    var image: String?
    var status: String?
    var state: String?
}

struct HostProcess: Identifiable, Codable, Hashable, Sendable {
    var id: String { "\(pid)-\(command)" }
    var pid: Int
    var user: String?
    var cpuPct: Double?
    var memPct: Double?
    var command: String
}

struct HostMetrics: Codable, Sendable {
    var cpuPct: Double?
    var memUsed: Int64?
    var memTotal: Int64?
    var load1: Double?
    var uptimeSec: Double?
}

@Observable
@MainActor
final class AgentDeviceService {
    private let api: ControlAPIClient
    private let session: SessionStore

    var containers: [RemoteContainer] = []
    var applications: [InfraApplication] = []
    var processes: [HostProcess] = []
    var metrics: HostMetrics?
    var selectedLogText: String?
    var selectedLogContainerId: String?
    var logNote: String?
    var blockedReason: String?
    var lastError: String?
    var isLoading = false

    init(api: ControlAPIClient, session: SessionStore) {
        self.api = api
        self.session = session
    }

    func refresh(deviceId: String) async {
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        guard session.isAuthenticated else {
            blockedReason = "Sign in required."
            containers = []; applications = []; processes = []; metrics = nil
            return
        }
        do {
            async let cData = api.get(path: "infra/devices/\(deviceId)/containers")
            async let aData = api.get(path: "infra/devices/\(deviceId)/applications")
            async let mData = api.get(path: "infra/devices/\(deviceId)/metrics")
            async let pData = api.get(path: "infra/devices/\(deviceId)/processes")
            let (c, a, m, p) = try await (cData, aData, mData, pData)
            struct CEnv: Decodable { var containers: [RemoteContainer]?; var healthy: Bool? }
            struct AEnv: Decodable {
                struct AppDTO: Decodable {
                    var id: String; var name: String; var deviceId: String?; var hostServer: String?
                    var status: String?; var listenAddresses: [String]?; var discoveredAt: Date?
                }
                var applications: [AppDTO]?
            }
            struct MEnv: Decodable { var metrics: HostMetrics? }
            struct PEnv: Decodable { var processes: [HostProcess]? }
            let ce = try await api.decode(CEnv.self, from: c)
            let ae = try await api.decode(AEnv.self, from: a)
            let me = try await api.decode(MEnv.self, from: m)
            let pe = try await api.decode(PEnv.self, from: p)
            containers = ce.containers ?? []
            applications = (ae.applications ?? []).map {
                InfraApplication(
                    id: $0.id, name: $0.name, deviceId: $0.deviceId ?? deviceId,
                    hostServer: $0.hostServer ?? "", status: $0.status ?? "unknown",
                    listenAddresses: $0.listenAddresses ?? [], discoveredAt: $0.discoveredAt
                )
            }
            processes = pe.processes ?? []
            metrics = me.metrics
            blockedReason = nil
        } catch {
            containers = []; applications = []; processes = []; metrics = nil
            blockedReason = error.localizedDescription
            lastError = error.localizedDescription
        }
    }

    func requestDiscovery(deviceId: String) async {
        do {
            _ = try await api.sendEmpty(method: "POST", path: "infra/devices/\(deviceId)/discovery/scan")
            blockedReason = "Discovery queued on host agent — refresh after next heartbeat."
        } catch {
            lastError = error.localizedDescription
        }
    }

    func fetchLogs(deviceId: String, containerId: String) async {
        selectedLogContainerId = containerId
        selectedLogText = nil
        logNote = nil
        do {
            struct Body: Encodable { var tail: Int }
            _ = try await api.send(
                method: "POST",
                path: "infra/devices/\(deviceId)/containers/\(containerId)/logs/fetch",
                body: Body(tail: 200)
            )
            // Prefer cached payload if Control already has it
            let data = try await api.get(path: "infra/devices/\(deviceId)/containers/\(containerId)/logs")
            struct LogEnv: Decodable {
                var text: String?
                var note: String?
                var cached: Bool?
            }
            let env = try await api.decode(LogEnv.self, from: data)
            if let text = env.text {
                selectedLogText = text
                logNote = env.cached == true ? nil : env.note
            } else {
                logNote = env.note ?? "Logs queued — refresh after the next host-agent heartbeat."
            }
        } catch {
            lastError = error.localizedDescription
            logNote = error.localizedDescription
        }
    }
}
