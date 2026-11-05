import SwiftUI

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var baseURL: String = ""
    @State private var saveMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Control backend") {
                    TextField("https://panel.example.com", text: $baseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(DXFont.mono(13))
                    Button("Save URL") {
                        let updated = env.config.savingBaseURL(baseURL)
                        saveMessage = updated.controlBaseURL == nil
                            ? "URL cleared or invalid."
                            : "Saved. New requests use this base URL."
                        Task { await env.backend.refresh() }
                    }
                    if let saveMessage {
                        Text(saveMessage).font(DXFont.mono(11)).foregroundStyle(DXColor.textSecondary)
                    }
                }

                Section("Session") {
                    LabeledContent("User") {
                        Text(env.sessionStore.username ?? "—").font(DXFont.mono(13))
                    }
                    Button("Sign out", role: .destructive) {
                        Task {
                            await env.sessionStore.signOut()
                            dismiss()
                        }
                    }
                }

                Section("Integrations") {
                    statusRow("Control", env.backend.isReachable)
                    statusRow("Tailscale", env.tailscale.isConnected)
                    statusRow("Cloudflare", env.backend.cloudflareConnected)
                    statusRow("GoDaddy", env.backend.godaddyConnected)
                }

                Section("Security") {
                    Text("Secrets use Keychain (WhenPasscodeSetThisDeviceOnly). SSH host keys are verified; unknown/changed keys are never accepted silently.")
                        .font(DXFont.body(13))
                        .foregroundStyle(DXColor.textSecondary)
                }

                Section("Build environment") {
                    Text("Native compile and Simulator require macOS with Xcode. This repository includes a valid Xcode project; Linux agents cannot run xcodebuild.")
                        .font(DXFont.body(13))
                        .foregroundStyle(DXColor.textSecondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(DXColor.bgPrimary)
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .onAppear { baseURL = AppConfig.load().controlBaseURL?.absoluteString ?? "" }
        }
    }

    private func statusRow(_ title: String, _ ok: Bool) -> some View {
        HStack {
            Text(title)
            Spacer()
            StatusDot(kind: ok ? .online : .offline)
            Text(ok ? "Connected" : "Disconnected")
                .font(DXFont.mono(12))
                .foregroundStyle(DXColor.textSecondary)
        }
    }
}
