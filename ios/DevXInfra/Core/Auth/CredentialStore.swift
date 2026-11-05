import Foundation

actor CredentialStore {
    private let keychain: KeychainStore

    private enum Account {
        static let sessionToken = "session.token"
        static let csrfToken = "session.csrf"
        static let username = "session.username"
        static func sshPassword(host: String, user: String) -> String { "ssh.password.\(user)@\(host)" }
        static func hostKey(host: String) -> String { "ssh.hostkey.\(host)" }
    }

    init(keychain: KeychainStore) {
        self.keychain = keychain
    }

    func saveSession(token: String, csrf: String, username: String) throws {
        try keychain.setString(token, account: Account.sessionToken)
        try keychain.setString(csrf, account: Account.csrfToken)
        try keychain.setString(username, account: Account.username)
    }

    func clearSession() throws {
        try keychain.delete(account: Account.sessionToken)
        try keychain.delete(account: Account.csrfToken)
        try keychain.delete(account: Account.username)
    }

    func sessionToken() throws -> String? { try keychain.string(account: Account.sessionToken) }
    func csrfToken() throws -> String? { try keychain.string(account: Account.csrfToken) }
    func username() throws -> String? { try keychain.string(account: Account.username) }

    func saveSSHPassword(host: String, user: String, password: String) throws {
        try keychain.setString(password, account: Account.sshPassword(host: host, user: user))
    }

    func sshPassword(host: String, user: String) throws -> String? {
        try keychain.string(account: Account.sshPassword(host: host, user: user))
    }

    func saveHostKeyFingerprint(host: String, fingerprint: String) throws {
        try keychain.setString(fingerprint, account: Account.hostKey(host: host))
    }

    func hostKeyFingerprint(host: String) throws -> String? {
        try keychain.string(account: Account.hostKey(host: host))
    }
}
