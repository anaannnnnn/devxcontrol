import Foundation
import Observation

struct PublishStage: Identifiable, Codable, Sendable {
    var id: String { "\(stage)-\(at)" }
    var stage: String
    var ok: Bool
    var detail: String?
    var at: String
}

struct PublishOperation: Codable, Sendable {
    var operationId: String
    var fqdn: String?
    var status: String?
    var stages: [PublishStage]?
}

@Observable
@MainActor
final class PublishService {
    private let api: ControlAPIClient

    var lastOperation: PublishOperation?
    var lastError: String?

    init(api: ControlAPIClient) {
        self.api = api
    }

    func publish(deviceId: String, applicationId: String, domain: String, subdomain: String, provider: String?) async {
        lastError = nil
        struct Body: Encodable {
            var deviceId: String
            var applicationId: String
            var domain: String
            var subdomain: String
            var provider: String?
        }
        do {
            let data = try await api.send(
                method: "POST",
                path: "infra/publish",
                body: Body(deviceId: deviceId, applicationId: applicationId, domain: domain, subdomain: subdomain, provider: provider)
            )
            lastOperation = try await api.decode(PublishOperation.self, from: data)
        } catch {
            lastError = error.localizedDescription
            lastOperation = nil
        }
    }
}
