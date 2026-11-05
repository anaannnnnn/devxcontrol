import SwiftUI

struct ActivityView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if env.overview.activity.isEmpty {
                    EmptyStateView(
                        title: "No activity yet",
                        message: env.overview.notes.first
                            ?? "The activity feed shows real events from the control backend and host agents. Until those sources report events, this list stays empty.",
                        systemImage: "bell",
                        actionTitle: "Refresh",
                        action: { Task { await env.overview.refresh() } }
                    )
                } else {
                    List(env.overview.activity) { event in
                        HStack(alignment: .top, spacing: 10) {
                            StatusDot(
                                kind: event.statusType == "ok" ? .online
                                    : event.statusType == "bad" ? .critical : .warning,
                                size: 7
                            )
                            VStack(alignment: .leading, spacing: 4) {
                                Text(event.message)
                                    .font(DXFont.body(14))
                                    .foregroundStyle(DXColor.textPrimary)
                                Text(event.timestamp.formatted(date: .abbreviated, time: .shortened))
                                    .font(DXFont.mono(11))
                                    .foregroundStyle(DXColor.textMuted)
                            }
                        }
                        .listRowBackground(DXColor.bgSecondary)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Activity")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .task { await env.overview.refresh() }
            .refreshable { await env.overview.refresh() }
        }
    }
}
