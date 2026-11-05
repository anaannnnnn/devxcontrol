import SwiftUI

struct MetricTile: View {
    let label: String
    let value: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(DXFont.eyebrow(10))
                .foregroundStyle(DXColor.textMuted)
            Text(value)
                .font(DXFont.mono(22, weight: .semibold))
                .foregroundStyle(DXColor.textPrimary)
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            if let subtitle {
                Text(subtitle)
                    .font(DXFont.mono(11))
                    .foregroundStyle(DXColor.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .overlay(
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .stroke(DXColor.borderInactive, lineWidth: 1)
        )
    }
}
