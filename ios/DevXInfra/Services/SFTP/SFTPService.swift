import Foundation
import Observation
import NIO
import Citadel

struct RemoteFileItem: Identifiable, Hashable, Sendable {
    var id: String { path }
    var name: String
    var path: String
    var isDirectory: Bool
    var size: Int64?
    var modifiedAt: Date?
}

/// SFTP over the active Citadel SSH session. No fabricated directory listings.
@Observable
@MainActor
final class SFTPService {
    private let ssh: SSHService

    var cwd: String = "."
    var entries: [RemoteFileItem] = []
    var lastError: String?
    var isBusy = false

    init(ssh: SSHService) {
        self.ssh = ssh
    }

    var isAvailable: Bool { ssh.isConnected }

    func list(path: String) async throws {
        lastError = nil
        guard isAvailable else {
            entries = []
            lastError = "SFTP requires an active verified SSH session."
            throw InfraError.sshUnavailable(lastError!)
        }
        isBusy = true
        defer { isBusy = false }
        let sftp = try await ssh.openSFTP()
        defer { Task { try? await sftp.close() } }
        let names = try await sftp.listDirectory(atPath: path)
        // Citadel returns [SFTPMessage.Name] — each has .path components / filename
        var items: [RemoteFileItem] = []
        for nameMsg in names {
            for component in nameMsg.components {
                let filename = component.filename
                if filename == "." || filename == ".." { continue }
                let full = path == "." || path == "/"
                    ? (path == "/" ? "/\(filename)" : filename)
                    : "\(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/\(filename)"
                    .replacingOccurrences(of: "//", with: "/")
                let isDir = (component.attributes.permissions ?? 0) & 0o040000 != 0
                    || component.longname.hasPrefix("d")
                items.append(RemoteFileItem(
                    name: filename,
                    path: full.hasPrefix("/") || path == "." ? (path == "." ? filename : full) : full,
                    isDirectory: isDir,
                    size: component.attributes.size.map(Int64.init),
                    modifiedAt: nil
                ))
            }
        }
        entries = items.sorted { lhs, rhs in
            if lhs.isDirectory != rhs.isDirectory { return lhs.isDirectory && !rhs.isDirectory }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
        cwd = try await sftp.getRealPath(atPath: path)
    }

    func mkdir(_ path: String) async throws {
        let sftp = try await requireSFTP()
        defer { Task { try? await sftp.close() } }
        try await sftp.createDirectory(atPath: path)
        try await list(path: cwd)
    }

    func remove(path: String, isDirectory: Bool) async throws {
        let sftp = try await requireSFTP()
        defer { Task { try? await sftp.close() } }
        if isDirectory { try await sftp.rmdir(at: path) }
        else { try await sftp.remove(at: path) }
        try await list(path: cwd)
    }

    func rename(from: String, to: String) async throws {
        let sftp = try await requireSFTP()
        defer { Task { try? await sftp.close() } }
        try await sftp.rename(at: from, to: to)
        try await list(path: cwd)
    }

    func download(path: String) async throws -> Data {
        let sftp = try await requireSFTP()
        defer { Task { try? await sftp.close() } }
        return try await sftp.withFile(filePath: path, flags: .read) { file in
            let buffer = try await file.readAll()
            return Data(buffer.readableBytesView)
        }
    }

    func upload(data: Data, to path: String) async throws {
        let sftp = try await requireSFTP()
        defer { Task { try? await sftp.close() } }
        try await sftp.withFile(filePath: path, flags: [.write, .create, .truncate]) { file in
            try await file.write(ByteBuffer(bytes: data))
        }
        try await list(path: cwd)
    }

    private func requireSFTP() async throws -> SFTPClient {
        guard isAvailable else {
            lastError = "SFTP requires an active verified SSH session."
            throw InfraError.sshUnavailable(lastError!)
        }
        isBusy = true
        defer { isBusy = false }
        return try await ssh.openSFTP()
    }

    private func join(_ base: String, _ name: String) -> String {
        if base == "/" { return "/\(name)" }
        if base == "." { return name }
        return "\(base)/\(name)"
    }
}
