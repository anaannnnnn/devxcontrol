import SwiftUI

struct IntegrationPill: View {
    let title: String
    let connected: Bool
    var detail: String?

    var body: some View {
        HStack(spacing: 6) {
            StatusDot(kind: connected ? .online : .offline, size: 6)
            Text(title)
                .font(DXFont.mono(11, weight: .medium))
                .foregroundStyle(DXColor.textPrimary)
            if let detail {
                Text(detail)
                    .font(DXFont.mono(10))
                    .foregroundStyle(DXColor.textMuted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .overlay(
            Capsule()
                .stroke(connected ? DXColor.borderActive.opacity(0.7) : DXColor.borderInactive, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(connected ? "connected" : "disconnected")")
    }
}
