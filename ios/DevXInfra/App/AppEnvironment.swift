import Foundation
import Observation

@Observable
@MainActor
final class AppEnvironment {
    let config: AppConfig
    let keychain: KeychainStore
    let credentialStore: CredentialStore
    let apiClient: ControlAPIClient
    let sessionStore: SessionStore
    let appState: AppState
    let tailscale: TailscaleService
    let ssh: SSHService
    let sftp: SFTPService
    let backend: BackendStatusService
    /// Bumped when nested session auth changes so SwiftUI refreshes the root shell.
    var authGeneration: Int = 0

    init(
        config: AppConfig,
        keychain: KeychainStore,
        credentialStore: CredentialStore,
        apiClient: ControlAPIClient,
        sessionStore: SessionStore,
        appState: AppState,
        tailscale: TailscaleService,
        ssh: SSHService,
        sftp: SFTPService,
        backend: BackendStatusService
    ) {
        self.config = config
        self.keychain = keychain
        self.credentialStore = credentialStore
        self.apiClient = apiClient
        self.sessionStore = sessionStore
        self.appState = appState
        self.tailscale = tailscale
        self.ssh = ssh
        self.sftp = sftp
        self.backend = backend
        sessionStore.attach { [weak self] in
            self?.authGeneration &+= 1
        }
    }

    static func bootstrap() -> AppEnvironment {
        let config = AppConfig.load()
        let keychain = KeychainStore(service: "online.devxpert.DevXInfra")
        let credentials = CredentialStore(keychain: keychain)
        let api = ControlAPIClient(config: config, credentialStore: credentials)
        let session = SessionStore(api: api, credentials: credentials)
        let state = AppState()
        let backend = BackendStatusService(api: api, session: session)
        let tailscale = TailscaleService(api: api, session: session)
        let ssh = SSHService(credentials: credentials)
        let sftp = SFTPService(ssh: ssh)
        return AppEnvironment(
            config: config,
            keychain: keychain,
            credentialStore: credentials,
            apiClient: api,
            sessionStore: session,
            appState: state,
            tailscale: tailscale,
            ssh: ssh,
            sftp: sftp,
            backend: backend
        )
    }
}
