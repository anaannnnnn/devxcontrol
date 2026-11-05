import SwiftUI

struct RootView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var unlocked = false
    @State private var unlockError: String?

    var body: some View {
        Group {
            if !unlocked {
                LockScreen(
                    errorMessage: unlockError,
                    onUnlock: unlock
                )
            } else if !env.sessionStore.isAuthenticated {
                AuthView()
            } else {
                MainTabShell()
            }
        }
        .id(env.authGeneration)
        .background(DXColor.bgPrimary.ignoresSafeArea())
        .task {
            await env.sessionStore.restoreIfPossible()
        }
    }

    private func unlock() {
        Task {
            do {
                try await LocalAuthGate.shared.evaluate(
                    reason: "Unlock DevX Infrastructure OS"
                )
                unlockError = nil
                unlocked = true
            } catch LocalAuthError.unavailable {
                // Device has no passcode/biometrics policy — continue with an explicit warning.
                unlockError = "Device authentication unavailable; continuing with reduced local protection."
                unlocked = true
            } catch {
                unlockError = error.localizedDescription
            }
        }
    }
}
