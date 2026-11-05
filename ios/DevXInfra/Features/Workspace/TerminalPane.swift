import SwiftUI

struct TerminalPane: View {
    @Environment(AppEnvironment.self) private var env
    let device: InfraDevice

    @State private var username = "ubuntu"
    @State private var password = ""
    @State private var port = "22"
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("SSH Terminal")
                    .dxText(.eyebrow)
                Text("Interactive PTY requires a maintained SSH library linked into the iOS target. This build will not open a simulated shell.")
                    .dxText(.secondary)

                labeled("Host", value: device.primaryAddress ?? device.magicDns ?? "—")
                field("Username", text: $username)
                field("Port", text: $port)
                secure("Password (Keychain)", text: $password)

                if let message {
                    Text(message)
                        .font(DXFont.mono(12))
                        .foregroundStyle(DXColor.warning)
                }

                HStack {
                    Button("Connect") { connect() }
                        .buttonStyle(DXPrimaryButtonStyle())
                    Button("Disconnect") { env.ssh.disconnect(); message = nil }
                        .buttonStyle(DXSecondaryButtonStyle())
                }

                stateBlock
            }
            .padding(16)
        }
    }

    private var stateBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Session state")
                .dxText(.eyebrow)
            Text(String(describing: env.ssh.state))
                .font(DXFont.mono(12))
                .foregroundStyle(DXColor.textSecondary)
            Text(env.ssh.statusMessage)
                .font(DXFont.mono(11))
                .foregroundStyle(DXColor.textMuted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
    }

    private func labeled(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).dxText(.muted)
            Text(value).font(DXFont.mono(13)).foregroundStyle(DXColor.textPrimary)
        }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).dxText(.muted)
            TextField(title, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(10)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                .font(DXFont.mono(13))
                .foregroundStyle(DXColor.textPrimary)
        }
    }

    private func secure(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).dxText(.muted)
            SecureField("Password", text: text)
                .padding(10)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                .font(DXFont.mono(13))
                .foregroundStyle(DXColor.textPrimary)
        }
    }

    private func connect() {
        guard let host = device.primaryAddress ?? device.magicDns else {
            message = "Device has no Tailscale address to connect to."
            return
        }
        let portValue = Int(port) ?? 22
        let target = SSHTarget(host: host, port: portValue, username: username)
        Task {
            do {
                try await env.ssh.prepareConnection(to: target, password: password)
                message = nil
            } catch {
                message = error.localizedDescription
            }
        }
    }
}
