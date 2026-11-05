import Foundation
import Observation

struct RemoteFileItem: Identifiable, Hashable, Sendable {
    var id: String { path }
    var name: String
    var path: String
    var isDirectory: Bool
    var size: Int64?
    var modifiedAt: Date?
}

/// SFTP rides the same SSH transport. No fake directory listings.
@Observable
@MainActor
final class SFTPService {
    private let ssh: SSHService

    var cwd: String = "."
    var entries: [RemoteFileItem] = []
    var lastError: String?

    init(ssh: SSHService) {
        self.ssh = ssh
    }

    var isAvailable: Bool {
        if case .connected = ssh.state { return true }
        return false
    }

    func list(path: String) async throws {
        lastError = nil
        guard isAvailable else {
            entries = []
            lastError = "SFTP requires an active verified SSH session. \(ssh.statusMessage)"
            throw InfraError.sshUnavailable(lastError ?? "SFTP unavailable")
        }
        // Real listDir would run here via the SSH library.
        cwd = path
    }
}
