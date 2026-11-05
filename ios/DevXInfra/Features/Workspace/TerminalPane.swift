import SwiftUI

struct TerminalPane: View {
    @Environment(AppEnvironment.self) private var env
    let device: InfraDevice

    @State private var username = "ubuntu"
    @State private var password = ""
    @State private var port = "22"
    @State private var input = ""
    @State private var message: String?

    var body: some View {
        VStack(spacing: 0) {
            connectionBar
            DXHairline()
            ScrollViewReader { proxy in
                ScrollView {
                    Text(env.ssh.terminalOutput.isEmpty ? placeholder : env.ssh.terminalOutput)
                        .font(DXFont.mono(12))
                        .foregroundStyle(env.ssh.terminalOutput.isEmpty ? DXColor.textMuted : DXColor.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(12)
                        .id("end")
                }
                .background(DXColor.bgSecondary)
                .onChange(of: env.ssh.terminalOutput) { _, _ in
                    proxy.scrollTo("end", anchor: .bottom)
                }
            }
            if case .needsHostKeyConfirmation(let fp, let changed) = env.ssh.state {
                hostKeyBanner(fingerprint: fp, changed: changed)
            }
            inputBar
        }
    }

    private var placeholder: String {
        "Interactive PTY via Citadel. Connect with verified host keys — sessions are never simulated.\nHost: \(device.primaryAddress ?? device.magicDns ?? "—")"
    }

    private var connectionBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("SSH").dxText(.eyebrow)
                Spacer()
                Text(statusLabel)
                    .font(DXFont.mono(11))
                    .foregroundStyle(DXColor.textSecondary)
            }
            HStack(spacing: 8) {
                field("user", text: $username)
                field("port", text: $port).frame(width: 64)
                SecureField("password", text: $password)
                    .padding(8)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                    .font(DXFont.mono(12))
            }
            HStack {
                Button("Connect") { connect() }
                    .buttonStyle(DXPrimaryButtonStyle())
                    .disabled(env.ssh.isConnected)
                Button("Disconnect") { env.ssh.disconnect(); message = nil }
                    .buttonStyle(DXSecondaryButtonStyle())
            }
            if let message {
                Text(message).font(DXFont.mono(11)).foregroundStyle(DXColor.warning)
            }
        }
        .padding(12)
    }

    private func hostKeyBanner(fingerprint: String, changed: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(changed ? "HOST KEY CHANGED" : "UNKNOWN HOST KEY")
                .font(DXFont.eyebrow(10))
                .foregroundStyle(changed ? DXColor.critical : DXColor.warning)
            Text(fingerprint)
                .font(DXFont.mono(11))
                .foregroundStyle(DXColor.textPrimary)
                .textSelection(.enabled)
            Text(changed
                ? "Refusing silent overwrite. Only continue if you intentionally rotated this host’s key."
                : "Verify this fingerprint out-of-band, then trust it to store in Keychain.")
                .dxText(.muted)
            Button(changed ? "Replace stored key & reconnect" : "Trust & reconnect") {
                Task {
                    do {
                        try await env.ssh.confirmPendingHostKeyAndReconnect(password: password)
                        message = nil
                    } catch {
                        message = error.localizedDescription
                    }
                }
            }
            .buttonStyle(DXPrimaryButtonStyle())
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DXColor.bgElevated)
    }

    private var inputBar: some View {
        VStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(["ESC", "TAB", "CTRL-C", "↑", "↓", "←", "→", "|", "~", "/"], id: \.self) { key in
                        Button(key) { sendSpecial(key) }
                            .font(DXFont.mono(11, weight: .medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                            .disabled(!env.ssh.isConnected)
                    }
                }
            }
            HStack(spacing: 8) {
                TextField("Send to PTY", text: $input)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(DXFont.mono(13))
                    .padding(10)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                    .onSubmit { sendLine() }
                Button("↵") { sendLine() }
                    .buttonStyle(DXPrimaryButtonStyle())
                    .disabled(!env.ssh.isConnected || input.isEmpty)
            }
        }
        .padding(10)
        .background(DXColor.bgPrimary)
    }

    private func sendSpecial(_ key: String) {
        let map: [String: String] = [
            "ESC": "\u{1b}",
            "TAB": "\t",
            "CTRL-C": "\u{3}",
            "↑": "\u{1b}[A",
            "↓": "\u{1b}[B",
            "→": "\u{1b}[C",
            "←": "\u{1b}[D",
        ]
        let payload = map[key] ?? key
        Task { await env.ssh.send(payload) }
    }

    private var statusLabel: String {
        switch env.ssh.state {
        case .idle: "idle"
        case .connecting: "connecting…"
        case .connected: "connected"
        case .needsHostKeyConfirmation: "host key"
        case .failed(let m): m
        }
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(8)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
            .font(DXFont.mono(12))
    }

    private func connect() {
        guard let host = device.primaryAddress ?? device.magicDns else {
            message = "Device has no Tailscale address."
            return
        }
        let target = SSHTarget(host: host, port: Int(port) ?? 22, username: username)
        Task {
            do {
                try await env.ssh.connect(to: target, password: password)
                message = nil
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func sendLine() {
        let line = input
        input = ""
        Task { await env.ssh.send(line + "\n") }
    }
}
