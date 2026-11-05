import Foundation
import Observation
import NIO
import NIOSSH
@preconcurrency import Citadel

struct SSHTarget: Hashable, Sendable {
    var host: String
    var port: Int
    var username: String
}

enum SSHSessionState: Equatable, Sendable {
    case idle
    case connecting
    case needsHostKeyConfirmation(fingerprint: String, changed: Bool)
    case connected
    case failed(String)
}

/// Real SSH via Citadel (SwiftNIO SSH). Does not simulate shells.
@Observable
@MainActor
final class SSHService {
    private let credentials: CredentialStore

    var state: SSHSessionState = .idle
    var activeTarget: SSHTarget?
    var libraryAvailable: Bool = true
    var statusMessage: String = "Citadel SSH linked. Host keys verified via Keychain."
    var terminalOutput: String = ""
    var pendingFingerprint: String?
    var pendingChanged: Bool = false

    private var client: SSHClient?
    private var ptyTask: Task<Void, Never>?
    private var stdinWriter: TTYStdinWriter?
    private var acceptedFingerprint: String?
    private var allowReplace = false

    init(credentials: CredentialStore) {
        self.credentials = credentials
    }

    func connect(to target: SSHTarget, password: String?, acceptHostKey fingerprint: String? = nil, replaceChanged: Bool = false) async throws {
        disconnect()
        activeTarget = target
        state = .connecting
        acceptedFingerprint = fingerprint
        allowReplace = replaceChanged
        terminalOutput = ""

        if let password, !password.isEmpty {
            try await credentials.saveSSHPassword(host: target.host, user: target.username, password: password)
        }
        guard let secret = try await credentials.sshPassword(host: target.host, user: target.username), !secret.isEmpty else {
            state = .failed("SSH password missing for \(target.username)@\(target.host).")
            throw InfraError.sshUnavailable("Missing SSH credentials.")
        }

        let validator = KeychainHostKeyValidator(
            credentials: credentials,
            host: target.host,
            port: target.port,
            acceptFingerprint: fingerprint,
            allowReplace: replaceChanged
        )

        let settings = SSHClientSettings(
            host: target.host,
            port: target.port,
            authenticationMethod: { .passwordBased(username: target.username, password: secret) },
            hostKeyValidator: .custom(validator)
        )

        do {
            let ssh = try await SSHClient.connect(to: settings)
            client = ssh
            state = .connected
            statusMessage = "Connected to \(target.username)@\(target.host):\(target.port)"
            startPTY(on: ssh)
        } catch let err as HostKeyRejectedError {
            pendingFingerprint = validator.lastFingerprint
            switch err.reason {
            case .unknown(let fp):
                pendingChanged = false
                state = .needsHostKeyConfirmation(fingerprint: fp, changed: false)
            case .changed(_, let fp):
                pendingChanged = true
                state = .needsHostKeyConfirmation(fingerprint: fp, changed: true)
            case .trusted:
                state = .failed(err.localizedDescription)
            }
            statusMessage = err.localizedDescription
            throw err
        } catch {
            state = .failed(error.localizedDescription)
            statusMessage = error.localizedDescription
            throw InfraError.sshUnavailable(error.localizedDescription)
        }
    }

    /// User explicitly trusts the pending host key fingerprint, then reconnects.
    func confirmPendingHostKeyAndReconnect(password: String?) async throws {
        guard let target = activeTarget, let fp = pendingFingerprint else {
            throw InfraError.sshUnavailable("No pending host key to confirm.")
        }
        try await connect(to: target, password: password, acceptHostKey: fp, replaceChanged: pendingChanged)
    }

    private func startPTY(on ssh: SSHClient) {
        ptyTask?.cancel()
        ptyTask = Task { [weak self] in
            guard let self else { return }
            do {
                let request = SSHChannelRequestEvent.PseudoTerminalRequest(
                    wantReply: true,
                    term: "xterm-256color",
                    terminalCharacterWidth: 80,
                    terminalRowHeight: 24,
                    terminalPixelWidth: 0,
                    terminalPixelHeight: 0,
                    terminalModes: .init([.ECHO: 1])
                )
                try await ssh.withPTY(request) { inbound, outbound in
                    await MainActor.run { self.stdinWriter = outbound }
                    for try await chunk in inbound {
                        let text: String
                        switch chunk {
                        case .stdout(let buf), .stderr(let buf):
                            text = String(buffer: buf)
                        }
                        await MainActor.run {
                            self.terminalOutput.append(text)
                            if self.terminalOutput.count > 200_000 {
                                self.terminalOutput.removeFirst(self.terminalOutput.count - 160_000)
                            }
                        }
                    }
                }
            } catch is CancellationError {
                // expected on disconnect
            } catch {
                await MainActor.run {
                    self.state = .failed(error.localizedDescription)
                    self.statusMessage = error.localizedDescription
                }
            }
            await MainActor.run {
                self.stdinWriter = nil
                if case .connected = self.state {
                    self.state = .idle
                    self.statusMessage = "PTY session ended."
                }
            }
        }
    }

    func send(_ text: String) async {
        guard let writer = stdinWriter else { return }
        do {
            try await writer.write(ByteBuffer(string: text))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func resize(cols: Int, rows: Int) async {
        guard let writer = stdinWriter else { return }
        try? await writer.changeSize(cols: cols, rows: rows, pixelWidth: 0, pixelHeight: 0)
    }

    func openSFTP() async throws -> SFTPClient {
        guard let client else {
            throw InfraError.sshUnavailable("SSH is not connected.")
        }
        return try await client.openSFTP()
    }

    var isConnected: Bool {
        if case .connected = state { return true }
        return false
    }

    func disconnect() {
        ptyTask?.cancel()
        ptyTask = nil
        stdinWriter = nil
        let existing = client
        client = nil
        state = .idle
        pendingFingerprint = nil
        statusMessage = "Disconnected."
        if let existing {
            Task { try? await existing.close() }
        }
    }
}
