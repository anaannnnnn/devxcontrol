import Foundation

struct ProblemDetails: Decodable, Sendable {
    var type: String?
    var title: String?
    var status: Int?
    var detail: String?

    var message: String { detail ?? title ?? "Request failed." }
}

struct HTTPResponseBox: Sendable {
    var status: Int
    var data: Data
    var setCookieHeaders: [String]
}

actor ControlAPIClient {
    private let credentialStore: CredentialStore
    private let session: URLSession
    private let decoder: JSONDecoder

    init(config: AppConfig, credentialStore: CredentialStore, session: URLSession = .shared) {
        _ = config
        self.credentialStore = credentialStore
        self.session = session
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        self.decoder = dec
    }

    func baseURL() throws -> URL {
        // Always re-read so Settings URL changes apply without restarting the process.
        guard let url = AppConfig.load().controlBaseURL else {
            throw InfraError.notConfigured(.controlBackend)
        }
        return url
    }

    func get(path: String, query: [URLQueryItem] = []) async throws -> Data {
        try await request(method: "GET", path: path, query: query, body: nil as Data?).data
    }

    func send<Body: Encodable>(method: String, path: String, body: Body) async throws -> Data {
        try await requestJSON(method: method, path: path, body: body).data
    }

    func sendEmpty(method: String, path: String) async throws -> Data {
        try await request(method: method, path: path, query: [], body: Data("{}".utf8)).data
    }

    func requestJSON<Body: Encodable>(method: String, path: String, body: Body) async throws -> HTTPResponseBox {
        let data = try JSONEncoder().encode(body)
        return try await request(method: method, path: path, query: [], body: data)
    }

    func request(method: String, path: String, query: [URLQueryItem], body: Data?) async throws -> HTTPResponseBox {
        let root = try baseURL()
        var components = URLComponents(url: root.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))), resolvingAgainstBaseURL: false)
        if path.hasPrefix("api/") || path.hasPrefix("/api/") {
            let cleaned = path.hasPrefix("/") ? String(path.dropFirst()) : path
            components = URLComponents(url: root.appendingPathComponent(cleaned), resolvingAgainstBaseURL: false)
        } else {
            let cleaned = "api/v1/" + path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            components = URLComponents(url: root.appendingPathComponent(cleaned), resolvingAgainstBaseURL: false)
        }
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw InfraError.network("Invalid URL.") }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let token = try await credentialStore.sessionToken() {
            // Control uses cookie `dc_s`; also accept token as cookie for URLSession.
            req.setValue("dc_s=\(token)", forHTTPHeaderField: "Cookie")
        }
        if method != "GET" && method != "HEAD", let csrf = try await credentialStore.csrfToken() {
            req.setValue(csrf, forHTTPHeaderField: "x-csrf-token")
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw InfraError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw InfraError.network("Invalid response.")
        }
        if http.statusCode == 401 { throw InfraError.unauthorized }
        if !(200..<300).contains(http.statusCode) {
            if let problem = try? decoder.decode(ProblemDetails.self, from: data) {
                throw InfraError.backend(problem.message)
            }
            let text = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw InfraError.backend(text)
        }
        let setCookieHeaders = http.allHeaderFields.compactMap { key, value -> [String]? in
            guard String(describing: key).caseInsensitiveCompare("Set-Cookie") == .orderedSame else {
                return nil
            }
            if let cookie = value as? String { return [cookie] }
            return value as? [String]
        }.flatMap { $0 }
        return HTTPResponseBox(status: http.statusCode, data: data, setCookieHeaders: setCookieHeaders)
    }

    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw InfraError.backend("Could not decode response: \(error.localizedDescription)")
        }
    }
}
