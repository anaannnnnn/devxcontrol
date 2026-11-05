import SwiftUI

struct ActivityView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            EmptyStateView(
                title: "No activity yet",
                message: "The activity feed shows real events from the control backend and host agents. Until those sources report events, this list stays empty.",
                systemImage: "bell"
            )
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Activity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
