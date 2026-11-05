import Foundation
import Observation

struct ConnectionsPublic: Decodable, Sendable {
    struct DNS: Decodable, Sendable {
        var cloudflare: Bool?
        var godaddy: Bool?
    }
    struct Tailscale: Decodable, Sendable {
        var connected: Bool?
        var hasKey: Bool?
        var tailnet: String?
    }
    var dns: DNS?
    var tailscale: Tailscale?
    var llm: [String: String]?
}

@Observable
@MainActor
final class BackendStatusService {
    private let api: ControlAPIClient
    private let session: SessionStore

    var isReachable = false
    var cloudflareConnected = false
    var godaddyConnected = false
    var tailscaleConfigured = false
    var lastError: String?
    var notes: [String] = []

    init(api: ControlAPIClient, session: SessionStore) {
        self.api = api
        self.session = session
    }

    func refresh() async {
        notes = []
        lastError = nil
        do {
            _ = try await api.baseURL()
        } catch {
            isReachable = false
            cloudflareConnected = false
            godaddyConnected = false
            tailscaleConfigured = false
            notes = ["Set a DevX Control base URL in Settings to connect."]
            lastError = error.localizedDescription
            return
        }

        guard session.isAuthenticated else {
            isReachable = false
            notes = ["Sign in to load integration status."]
            return
        }

        do {
            if let data = try? await api.get(path: "connections") {
                let pub = try await api.decode(ConnectionsPublic.self, from: data)
                cloudflareConnected = pub.dns?.cloudflare == true
                godaddyConnected = pub.dns?.godaddy == true
                tailscaleConfigured = pub.tailscale?.connected == true || pub.tailscale?.hasKey == true
                isReachable = true
            } else {
                let data = try await api.get(path: "dns/domains")
                struct DomainsResp: Decodable { var domains: [InfraDomainDTO]?; var errors: [String: String]? }
                struct InfraDomainDTO: Decodable { var name: String; var provider: String }
                let resp = try await api.decode(DomainsResp.self, from: data)
                let providers = Set((resp.domains ?? []).map(\.provider))
                cloudflareConnected = providers.contains("cloudflare")
                godaddyConnected = providers.contains("godaddy")
                isReachable = true
            }
        } catch {
            isReachable = false
            lastError = error.localizedDescription
            notes = ["Control backend unreachable or returned an error."]
        }
    }
}
