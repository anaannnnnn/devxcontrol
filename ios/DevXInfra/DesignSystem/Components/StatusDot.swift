import SwiftUI

enum DXStatusKind {
    case online, offline, warning, critical, unknown

    var color: Color {
        switch self {
        case .online: DXColor.neonPrimary
        case .offline: DXColor.textMuted
        case .warning: DXColor.warning
        case .critical: DXColor.critical
        case .unknown: DXColor.textMuted
        }
    }

    var label: String {
        switch self {
        case .online: "Online"
        case .offline: "Offline"
        case .warning: "Warning"
        case .critical: "Critical"
        case .unknown: "Unknown"
        }
    }
}

struct StatusDot: View {
    let kind: DXStatusKind
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(kind.color)
            .frame(width: size, height: size)
            .neonGlow(active: kind == .online, radius: 6)
            .accessibilityLabel(kind.label)
    }
}
