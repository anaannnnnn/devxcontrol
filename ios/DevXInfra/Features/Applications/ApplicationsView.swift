import SwiftUI

struct ApplicationsView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        NavigationStack {
            EmptyStateView(
                title: "No discovered applications",
                message: "Local website and app discovery runs on an enrolled DevX Host Agent. Until an agent reports applications for a device, this list stays empty — it will not show sample apps.",
                systemImage: "app.badge"
            )
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Applications")
        }
    }
}
