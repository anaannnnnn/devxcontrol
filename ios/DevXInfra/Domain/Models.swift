import Foundation

enum DeviceStatus: String, Codable, Sendable {
    case online, offline, unknown
}

enum OsFamily: String, Codable, Sendable {
    case linux, windows, macos, ios, android, other
}

struct InfraDevice: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var name: String
    var os: OsFamily
    var osVersion: String?
    var addresses: [String]
    var magicDns: String?
    var status: DeviceStatus
    var lastSeenAt: Date?
    var appsCount: Int?
    var publishedCount: Int?
    var agentEnrolled: Bool
    var agentCapabilities: [String]

    var statusKind: DXStatusKind {
        switch status {
        case .online: .online
        case .offline: .offline
        case .unknown: .unknown
        }
    }

    var primaryAddress: String? { addresses.first }
}

struct InfraApplication: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var name: String
    var deviceId: String
    var hostServer: String
    var status: String
    var listenAddresses: [String]
    var discoveredAt: Date?
}

struct InfraDomain: Identifiable, Codable, Hashable, Sendable {
    var id: String { "\(provider):\(name)" }
    var name: String
    var provider: String
    var zoneId: String?
}

struct PublishedLink: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var url: String
    var deviceId: String
    var applicationId: String
    var domain: String
    var status: String
    var latencyMs: Int?
}

struct ActivityEvent: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var timestamp: Date
    var message: String
    var statusType: String
    var deviceId: String?
}

struct IntegrationSnapshot: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var state: String
    var detail: String?

    var isConnected: Bool { state == "connected" }
}

struct OverviewSnapshot: Codable, Sendable {
    var integrations: [IntegrationSnapshot]
    var devicesOnline: Int?
    var devicesTotal: Int?
    var applicationsTotal: Int?
    var publishedTotal: Int?
    var domainsTotal: Int?
    var activity: [ActivityEvent]
    var notes: [String]
}

enum ConnectionRequirement: String, Sendable {
    case controlBackend = "DevX Control backend URL and sign-in"
    case tailscaleAPI = "Tailscale API credentials on the control backend"
    case hostAgent = "DevX Host Agent enrolled on the target machine"
    case sshCredentials = "SSH credentials for the selected device"
    case dnsProvider = "Cloudflare or GoDaddy connection on the control backend"
}

struct BlockedCapability: Identifiable, Sendable {
    var id: String { requirement.rawValue + reason }
    var requirement: ConnectionRequirement
    var reason: String
}

enum InfraError: LocalizedError, Sendable {
    case notConfigured(ConnectionRequirement)
    case unauthorized
    case backend(String)
    case network(String)
    case sshUnavailable(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notConfigured(let req):
            return "Not configured: \(req.rawValue)."
        case .unauthorized:
            return "Sign in required."
        case .backend(let msg):
            return msg
        case .network(let msg):
            return msg
        case .sshUnavailable(let msg):
            return msg
        case .cancelled:
            return "Cancelled."
        }
    }
}
