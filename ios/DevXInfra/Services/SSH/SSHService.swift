import Foundation
import Observation

struct SSHTarget: Hashable, Sendable {
    var host: String
    var port: Int
    var username: String
}

enum SSHSessionState: Equatable, Sendable {
    case idle
    case connecting
    case needsHostKeyConfirmation(fingerprint: String)
    case connected
    case failed(String)
}

/// Real SSH requires a maintained native library linked on macOS/iOS (e.g. SwiftNIO SSH / Citadel).
/// This service refuses to simulate a shell. It manages credentials, host-key policy, and connection
/// readiness, and surfaces an honest unavailable state until a library is integrated and building.
@Observable
@MainActor
final class SSHService {
    private let credentials: CredentialStore

    var state: SSHSessionState = .idle
    var activeTarget: SSHTarget?
    var libraryAvailable: Bool = false
    var statusMessage: String =
        "SSH transport library is not linked in this build. Interactive sessions will not be simulated."

    init(credentials: CredentialStore) {
        self.credentials = credentials
        // Detect compile-time integration point. Until a package is added on macOS, remain false.
        libraryAvailable = false
    }

    func prepareConnection(to target: SSHTarget, password: String?) async throws {
        activeTarget = target
        state = .connecting
        if let password, !password.isEmpty {
            try await credentials.saveSSHPassword(host: target.host, user: target.username, password: password)
        }
        let stored = try await credentials.sshPassword(host: target.host, user: target.username)
        guard stored != nil || (password?.isEmpty == false) else {
            state = .failed("SSH password is not saved for \(target.username)@\(target.host).")
            throw InfraError.sshUnavailable("Missing SSH credentials.")
        }
        guard libraryAvailable else {
            state = .failed(statusMessage)
            throw InfraError.sshUnavailable(statusMessage)
        }
        // Library path would negotiate host key here, then open PTY.
    }

    func confirmHostKey(fingerprint: String, host: String) async throws {
        if let existing = try await credentials.hostKeyFingerprint(host: host), existing != fingerprint {
            state = .failed("Host key changed for \(host). Refusing silent overwrite.")
            throw InfraError.sshUnavailable("Host key mismatch for \(host).")
        }
        try await credentials.saveHostKeyFingerprint(host: host, fingerprint: fingerprint)
    }

    func disconnect() {
        state = .idle
        activeTarget = nil
    }
}
