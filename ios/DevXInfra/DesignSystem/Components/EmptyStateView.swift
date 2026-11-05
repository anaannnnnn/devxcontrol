import SwiftUI

struct EmptyStateView: View {
    let title: String
    let message: String
    var systemImage: String = "slash.circle"
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(DXColor.neonPrimary.opacity(0.8))
            Text(title)
                .dxText(.title)
                .multilineTextAlignment(.center)
            Text(message)
                .dxText(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(DXPrimaryButtonStyle())
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

struct DXPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DXFont.body(14).weight(.semibold))
            .foregroundStyle(DXColor.bgPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(DXColor.neonPrimary.opacity(configuration.isPressed ? 0.75 : 1), in: Capsule())
    }
}

struct DXSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DXFont.body(14).weight(.medium))
            .foregroundStyle(DXColor.neonPrimary)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .overlay(
                Capsule().stroke(DXColor.borderActive.opacity(configuration.isPressed ? 0.5 : 1), lineWidth: 1)
            )
    }
}

struct DXHairline: View {
    var body: some View {
        Rectangle()
            .fill(DXColor.borderInactive)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
    }
}
