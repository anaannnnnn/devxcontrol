import Foundation
import Observation

@Observable
@MainActor
final class OverviewService {
    private let api: ControlAPIClient
    private let session: SessionStore

    var integrations: [IntegrationSnapshot] = []
    var devicesOnline: Int?
    var devicesTotal: Int?
    var applicationsTotal: Int?
    var domainsTotal: Int?
    var activity: [ActivityEvent] = []
    var notes: [String] = []
    var lastError: String?

    init(api: ControlAPIClient, session: SessionStore) {
        self.api = api
        self.session = session
    }

    func refresh() async {
        guard session.isAuthenticated else {
            notes = ["Sign in to load Command Center overview."]
            return
        }
        do {
            let data = try await api.get(path: "infra/overview")
            struct Env: Decodable {
                var integrations: [IntegrationSnapshot]?
                var devices: Counts?
                var applications: Counts?
                var domains: DomainCounts?
                var activity: [ActivityEvent]?
                var notes: [String]?
                struct Counts: Decodable { var online: Int?; var total: Int? }
                struct DomainCounts: Decodable { var total: Int?; var providers: [String]? }
            }
            let env = try await api.decode(Env.self, from: data)
            integrations = env.integrations ?? []
            devicesOnline = env.devices?.online
            devicesTotal = env.devices?.total
            applicationsTotal = env.applications?.total
            domainsTotal = env.domains?.total
            activity = env.activity ?? []
            notes = env.notes ?? []
            lastError = nil
        } catch {
            lastError = error.localizedDescription
            notes = [error.localizedDescription]
        }
    }
}
