import SwiftUI

struct PublishSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0

    private let steps = ["Select App", "Domain", "Configure", "Publish"]

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    ForEach(Array(steps.enumerated()), id: \.offset) { idx, title in
                        Text(title)
                            .font(DXFont.mono(10, weight: .medium))
                            .foregroundStyle(idx == step ? DXColor.neonPrimary : DXColor.textMuted)
                        if idx < steps.count - 1 {
                            Rectangle().fill(DXColor.borderInactive).frame(height: 1)
                        }
                    }
                }
                EmptyStateView(
                    title: "Publish blocked",
                    message: "One-tap publish needs: a discovered application from a host agent, a connected DNS provider, and a working tunnel/verify pipeline on the control backend. This sheet will not mark a site LIVE without verification.",
                    systemImage: "hammer",
                    actionTitle: "Close",
                    action: { dismiss() }
                )
            }
            .padding(16)
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Publish")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
