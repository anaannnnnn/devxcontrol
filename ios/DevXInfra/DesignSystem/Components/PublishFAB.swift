import SwiftUI

struct PublishFAB: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .bold))
                Text("Publish")
                    .font(DXFont.body(15).weight(.semibold))
            }
            .foregroundStyle(DXColor.bgPrimary)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(DXColor.neonPrimary, in: Capsule())
            .neonGlow(radius: 14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Publish")
    }
}
