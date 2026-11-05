import Foundation
import Observation

@Observable
@MainActor
final class DomainsService {
    private let api: ControlAPIClient
    private let session: SessionStore

    var domains: [InfraDomain] = []
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
            domains = []
            blockedReason = "Sign in to load domains."
            return
        }

        do {
            let data = try await api.get(path: "dns/domains")
            struct Resp: Decodable {
                struct D: Decodable { var name: String; var provider: String; var id: String? }
                var domains: [D]?
                var errors: [String: String]?
            }
            let resp = try await api.decode(Resp.self, from: data)
            domains = (resp.domains ?? []).map {
                InfraDomain(name: $0.name, provider: $0.provider, zoneId: $0.id)
            }
            blockedReason = domains.isEmpty
                ? "No domains returned. Connect Cloudflare or GoDaddy under Control → Connections."
                : nil
            if let errors = resp.errors {
                lastError = errors.map { "\($0.key): \($0.value)" }.joined(separator: "; ")
            }
        } catch InfraError.notConfigured {
            domains = []
            blockedReason = ConnectionRequirement.controlBackend.rawValue
        } catch {
            domains = []
            blockedReason = error.localizedDescription
            lastError = error.localizedDescription
        }
    }
}
