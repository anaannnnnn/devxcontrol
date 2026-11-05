import SwiftUI
import UIKit

enum DXMotion {
    static let fast = Animation.easeOut(duration: 0.16)
    static let medium = Animation.easeInOut(duration: 0.28)
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.86)
    static let stagger: Double = 0.04

    @MainActor
    static var reduceMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
    }
}

struct NeonGlow: ViewModifier {
    var active: Bool = true
    var radius: CGFloat = 10

    func body(content: Content) -> some View {
        content.shadow(
            color: active && !DXMotion.reduceMotion
                ? DXColor.neonPrimary.opacity(0.35)
                : .clear,
            radius: radius,
            x: 0,
            y: 0
        )
    }
}

extension View {
    func neonGlow(active: Bool = true, radius: CGFloat = 10) -> some View {
        modifier(NeonGlow(active: active, radius: radius))
    }
}
