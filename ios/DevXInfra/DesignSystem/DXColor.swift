import SwiftUI

enum DXColor {
    static let bgPrimary = Color(hex: 0x030607)
    static let bgSecondary = Color(hex: 0x070D10)
    static let bgElevated = Color(hex: 0x0B1417)

    static let neonPrimary = Color(hex: 0x36FFB2)
    static let neonSecondary = Color(hex: 0x00D9FF)
    static let neonTertiary = Color(hex: 0x8B6CFF)

    static let textPrimary = Color(hex: 0xE8FFF6)
    static let textSecondary = Color(hex: 0x9AB7AB)
    static let textMuted = Color(hex: 0x607E73)

    static let borderInactive = Color(hex: 0x174A39)
    static let borderActive = Color(hex: 0x36FFB2)

    static let warning = Color(hex: 0xFFC857)
    static let critical = Color(hex: 0xFF536B)
    static let success = Color(hex: 0x36FFB2)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
