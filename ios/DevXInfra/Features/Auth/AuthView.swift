import SwiftUI

struct AuthView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var baseURL = ""
    @State private var username = ""
    @State private var password = ""
    @State private var totp = ""
    @State private var configError: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("DEVXINFRA")
                    .dxText(.eyebrow)
                Text("Sign in")
                    .font(DXFont.title(26))
                    .foregroundStyle(DXColor.textPrimary)
                Text("Connect to your DevX Control backend. Credentials stay in the Keychain. No demo fleet is loaded.")
                    .dxText(.secondary)

                field("Control base URL", text: $baseURL, prompt: "https://panel.example.com")
                field("Username", text: $username, prompt: "admin")
                secure("Password", text: $password)
                field("TOTP (if enabled)", text: $totp, prompt: "6-digit code")

                if let configError {
                    Text(configError).font(DXFont.mono(12)).foregroundStyle(DXColor.critical)
                }
                if let err = env.sessionStore.lastError {
                    Text(err).font(DXFont.mono(12)).foregroundStyle(DXColor.critical)
                }

                Button {
                    saveAndSignIn()
                } label: {
                    HStack {
                        if env.sessionStore.isBusy { ProgressView().tint(DXColor.bgPrimary) }
                        Text(env.sessionStore.isBusy ? "Signing in…" : "Sign in")
                    }
                }
                .buttonStyle(DXPrimaryButtonStyle())
                .disabled(env.sessionStore.isBusy || username.isEmpty || password.isEmpty || baseURL.isEmpty)

                Text("If the backend URL is wrong or unreachable, you will see an error — the app will not invent devices or sessions.")
                    .dxText(.muted)
            }
            .padding(24)
        }
        .background(DXColor.bgPrimary.ignoresSafeArea())
        .onAppear {
            baseURL = AppConfig.load().controlBaseURL?.absoluteString ?? ""
        }
    }

    private func field(_ title: String, text: Binding<String>, prompt: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).dxText(.muted)
            TextField(prompt, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                .foregroundStyle(DXColor.textPrimary)
                .font(DXFont.mono(14))
        }
    }

    private func secure(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).dxText(.muted)
            SecureField("••••••••", text: text)
                .padding(12)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                .foregroundStyle(DXColor.textPrimary)
                .font(DXFont.mono(14))
        }
    }

    private func saveAndSignIn() {
        configError = nil
        let updated = env.config.savingBaseURL(baseURL)
        guard updated.controlBaseURL != nil else {
            configError = "Enter a valid http(s) Control base URL."
            return
        }
        Task {
            await env.sessionStore.signIn(
                username: username,
                password: password,
                totp: totp
            )
        }
    }
}
