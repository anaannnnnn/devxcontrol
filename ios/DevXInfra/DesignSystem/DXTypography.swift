import SwiftUI

enum DXFont {
    static func title(_ size: CGFloat = 22) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }

    static func body(_ size: CGFloat = 15) -> Font {
        .system(size: size, weight: .regular, design: .default)
    }

    static func mono(_ size: CGFloat = 13, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    static func eyebrow(_ size: CGFloat = 11) -> Font {
        .system(size: size, weight: .semibold, design: .monospaced)
    }
}

struct DXTextStyle: ViewModifier {
    enum Role { case title, body, secondary, muted, mono, eyebrow }

    let role: Role

    func body(content: Content) -> some View {
        switch role {
        case .title:
            content.font(DXFont.title()).foregroundStyle(DXColor.textPrimary)
        case .body:
            content.font(DXFont.body()).foregroundStyle(DXColor.textPrimary)
        case .secondary:
            content.font(DXFont.body(14)).foregroundStyle(DXColor.textSecondary)
        case .muted:
            content.font(DXFont.body(13)).foregroundStyle(DXColor.textMuted)
        case .mono:
            content.font(DXFont.mono()).foregroundStyle(DXColor.textPrimary).monospacedDigit()
        case .eyebrow:
            content
                .font(DXFont.eyebrow())
                .foregroundStyle(DXColor.neonPrimary)
                .textCase(.uppercase)
                .tracking(1.4)
        }
    }
}

extension View {
    func dxText(_ role: DXTextStyle.Role) -> some View {
        modifier(DXTextStyle(role: role))
    }
}
