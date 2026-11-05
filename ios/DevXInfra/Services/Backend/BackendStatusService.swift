import Foundation
import Observation

struct ConnectionsPublic: Decodable, Sendable {
    struct DNS: Decodable, Sendable {
        var cloudflare: Bool?
        var godaddy: Bool?
    }
    var dns: DNS?
    var github: [String: String]?
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
            // Prefer connections endpoint; fall back to dns/domains.
            if let data = try? await api.get(path: "connections") {
                let pub = try await api.decode(ConnectionsPublic.self, from: data)
                cloudflareConnected = pub.dns?.cloudflare == true
                godaddyConnected = pub.dns?.godaddy == true
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
                if let errors = resp.errors, !errors.isEmpty {
                    notes.append(contentsOf: errors.map { "\($0.key): \($0.value)" })
                }
            }
        } catch {
            isReachable = false
            lastError = error.localizedDescription
            notes = ["Control backend unreachable or returned an error."]
        }
    }
}
