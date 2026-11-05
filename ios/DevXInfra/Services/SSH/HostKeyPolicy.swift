import Foundation
import NIO
import NIOSSH
import Citadel
import CryptoKit

enum HostKeyProbeResult: Sendable, Equatable {
    case trusted
    case unknown(fingerprint: String)
    case changed(previous: String, fingerprint: String)
}

struct HostKeyRejectedError: Error, LocalizedError {
    var reason: HostKeyProbeResult
    var errorDescription: String? {
        switch reason {
        case .trusted:
            return "Host key rejected."
        case .unknown(let fp):
            return "Unknown host key \(fp). Confirm the fingerprint before connecting."
        case .changed(let prev, let fp):
            return "HOST KEY CHANGED (was \(prev), now \(fp)). Connection refused until you explicitly replace the stored key."
        }
    }
}

/// Citadel host-key validator backed by Keychain. Never silently accepts unknown/changed keys.
final class KeychainHostKeyValidator: NIOSSHClientServerAuthenticationDelegate, @unchecked Sendable {
    private let credentials: CredentialStore
    private let hostKeyId: String
    /// When set and matches the presented fingerprint, unknown keys may be stored (explicit user trust).
    private let acceptFingerprint: String?
    /// When true and acceptFingerprint matches, a changed key may be replaced (explicit user trust).
    private let allowReplace: Bool

    private(set) var lastProbe: HostKeyProbeResult?
    private(set) var lastFingerprint: String?
    private(set) var lastBlob: Data?

    init(
        credentials: CredentialStore,
        host: String,
        port: Int,
        acceptFingerprint: String? = nil,
        allowReplace: Bool = false
    ) {
        self.credentials = credentials
        self.hostKeyId = "\(host):\(port)"
        self.acceptFingerprint = acceptFingerprint
        self.allowReplace = allowReplace
    }

    func validateHostKey(hostKey: NIOSSHPublicKey, validationCompletePromise: EventLoopPromise<Void>) {
        let blob = HostKeyCodec.blob(for: hostKey)
        let fingerprint = HostKeyCodec.fingerprintSHA256(blob)
        lastFingerprint = fingerprint
        lastBlob = blob

        Task {
            do {
                let knownFP = try await credentials.hostKeyFingerprint(host: hostKeyId)
                let knownBlob = try await credentials.hostKeyBlob(host: hostKeyId)

                if let knownBlob, let knownFP {
                    if knownBlob == blob {
                        lastProbe = .trusted
                        validationCompletePromise.succeed(())
                        return
                    }
                    let result = HostKeyProbeResult.changed(previous: knownFP, fingerprint: fingerprint)
                    lastProbe = result
                    if allowReplace, acceptFingerprint == fingerprint {
                        try await credentials.saveHostKey(host: hostKeyId, fingerprint: fingerprint, blob: blob)
                        validationCompletePromise.succeed(())
                        return
                    }
                    validationCompletePromise.fail(HostKeyRejectedError(reason: result))
                    return
                }

                let result = HostKeyProbeResult.unknown(fingerprint: fingerprint)
                lastProbe = result
                if let expected = acceptFingerprint, expected == fingerprint {
                    try await credentials.saveHostKey(host: hostKeyId, fingerprint: fingerprint, blob: blob)
                    validationCompletePromise.succeed(())
                    return
                }
                validationCompletePromise.fail(HostKeyRejectedError(reason: result))
            } catch {
                validationCompletePromise.fail(error)
            }
        }
    }
}

enum HostKeyCodec {
    static func blob(for key: NIOSSHPublicKey) -> Data {
        var buffer = ByteBufferAllocator().buffer(capacity: 256)
        _ = buffer.writeSSHHostKey(key)
        return Data(buffer.readableBytesView)
    }

    static func fingerprintSHA256(_ blob: Data) -> String {
        let digest = SHA256.hash(data: blob)
        return "SHA256:" + Data(digest).base64EncodedString()
    }
}
