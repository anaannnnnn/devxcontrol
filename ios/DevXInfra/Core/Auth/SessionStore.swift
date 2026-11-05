import Foundation
import Observation

struct SessionUser: Codable, Sendable {
    var username: String
}

struct SignInBody: Encodable, Sendable {
    var username: String
    var password: String
    var code: String?
}

struct SignInResponse: Decodable, Sendable {
    var username: String?
    var user: String?
    var csrf: String?
    var token: String?
}

@Observable
@MainActor
final class SessionStore {
    private let api: ControlAPIClient
    private let credentials: CredentialStore
    private var onChange: (() -> Void)?

    var isAuthenticated = false
    var username: String?
    var lastError: String?
    var isBusy = false

    init(api: ControlAPIClient, credentials: CredentialStore) {
        self.api = api
        self.credentials = credentials
    }

    func attach(onChange: @escaping () -> Void) {
        self.onChange = onChange
    }

    private func emit() {
        onChange?()
    }

    func restoreIfPossible() async {
        do {
            if let token = try await credentials.sessionToken(), !token.isEmpty {
                username = try await credentials.username()
                // Probe session; if backend missing, stay signed-out visually with honest error later.
                do {
                    _ = try await api.get(path: "session")
                    isAuthenticated = true
                } catch InfraError.notConfigured {
                    isAuthenticated = false
                } catch InfraError.unauthorized {
                    try? await credentials.clearSession()
                    isAuthenticated = false
                } catch {
                    // Token present but backend unreachable — keep local auth state, surface on refresh.
                    isAuthenticated = true
                    lastError = error.localizedDescription
                }
                emit()
            }
        } catch {
            lastError = error.localizedDescription
            emit()
        }
    }

    func signIn(username: String, password: String, totp: String?) async {
        isBusy = true
        lastError = nil
        defer { isBusy = false }
        do {
            let body = SignInBody(username: username, password: password, code: totp?.isEmpty == true ? nil : totp)
            let box = try await api.requestJSON(method: "POST", path: "session", body: body)
            let decoded = try? await api.decode(SignInResponse.self, from: box.data)
            let cookieToken = Self.cookieValue(named: "dc_s", from: box.setCookieHeaders) ?? decoded?.token
            let csrf = decoded?.csrf
                ?? Self.cookieValue(named: "csrf", from: box.setCookieHeaders)
                ?? ""
            guard let token = cookieToken, !token.isEmpty else {
                // Some Control builds set HttpOnly cookies that URLSession stores automatically.
                // Persist a session marker plus any CSRF from JSON so mutating calls still work.
                try await credentials.saveSession(token: "urlsession-cookie", csrf: csrf, username: username)
                self.username = username
                isAuthenticated = true
                emit()
                return
            }
            try await credentials.saveSession(token: token, csrf: csrf, username: username)
            self.username = username
            isAuthenticated = true
            emit()
        } catch {
            isAuthenticated = false
            lastError = error.localizedDescription
            emit()
        }
    }

    func signOut() async {
        _ = try? await api.request(method: "DELETE", path: "session", query: [], body: nil)
        try? await credentials.clearSession()
        isAuthenticated = false
        username = nil
        emit()
    }

    private static func cookieValue(named: String, from setCookieHeaders: [String]) -> String? {
        for piece in setCookieHeaders {
            for part in piece.split(separator: ";") {
                let kv = part.split(separator: "=", maxSplits: 1).map(String.init)
                if kv.count == 2, kv[0].trimmingCharacters(in: .whitespaces) == named {
                    return kv[1].trimmingCharacters(in: .whitespaces)
                }
            }
        }
        return nil
    }
}
