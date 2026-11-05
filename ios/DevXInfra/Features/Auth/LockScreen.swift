import SwiftUI

struct LockScreen: View {
    var errorMessage: String?
    var onUnlock: () -> Void

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            Image(systemName: "lock.shield")
                .font(.system(size: 40, weight: .thin))
                .foregroundStyle(DXColor.neonPrimary)
                .neonGlow()
            Text("DevXInfra")
                .font(DXFont.title(28))
                .foregroundStyle(DXColor.textPrimary)
            Text("Authenticate to unlock your infrastructure command center.")
                .dxText(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            if let errorMessage {
                Text(errorMessage)
                    .font(DXFont.mono(12))
                    .foregroundStyle(DXColor.critical)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            Button("Unlock", action: onUnlock)
                .buttonStyle(DXPrimaryButtonStyle())
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DXColor.bgPrimary.ignoresSafeArea())
    }
}
