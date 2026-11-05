import Foundation

struct AppConfig: Sendable {
    /// Base URL for DevX Control, e.g. https://panel.example.com
    var controlBaseURL: URL?

    static let controlBaseURLKey = "dx.controlBaseURL"

    static func load() -> AppConfig {
        let defaults = UserDefaults.standard
        let raw = defaults.string(forKey: controlBaseURLKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = raw.flatMap { URL(string: $0) }
        return AppConfig(controlBaseURL: url)
    }

    func savingBaseURL(_ string: String) -> AppConfig {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.controlBaseURLKey)
            return AppConfig(controlBaseURL: nil)
        }
        guard let url = URL(string: trimmed), url.scheme == "https" || url.scheme == "http" else {
            return self
        }
        UserDefaults.standard.set(trimmed, forKey: Self.controlBaseURLKey)
        return AppConfig(controlBaseURL: url)
    }
}
