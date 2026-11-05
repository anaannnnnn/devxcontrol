import Foundation
import LocalAuthentication

enum LocalAuthError: LocalizedError {
    case unavailable
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Device authentication is not available."
        case .failed(let msg):
            return msg
        }
    }
}

actor LocalAuthGate {
    static let shared = LocalAuthGate()

    func evaluate(reason: String) async throws {
        let context = LAContext()
        var error: NSError?
        let policy = LAPolicy.deviceOwnerAuthentication
        guard context.canEvaluatePolicy(policy, error: &error) else {
            // Simulator / unlocked CI hosts without biometrics: allow continue but surface honesty.
            if let error {
                throw LocalAuthError.failed(error.localizedDescription)
            }
            throw LocalAuthError.unavailable
        }
        do {
            let ok = try await context.evaluatePolicy(policy, localizedReason: reason)
            if !ok { throw LocalAuthError.failed("Authentication did not succeed.") }
        } catch {
            throw LocalAuthError.failed(error.localizedDescription)
        }
    }
}
