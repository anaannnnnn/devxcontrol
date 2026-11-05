import SwiftUI

struct ApplicationsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var deviceId: String = ""

    var body: some View {
        NavigationStack {
            Group {
                if env.agentDevices.applications.isEmpty {
                    EmptyStateView(
                        title: "No discovered applications",
                        message: env.agentDevices.blockedReason
                            ?? "Local website discovery runs on an enrolled DevX Host Agent. Select a device with an agent, then scan.",
                        systemImage: "app.badge",
                        actionTitle: env.appState.selectedDeviceID == nil ? nil : "Scan selected device",
                        action: env.appState.selectedDeviceID == nil ? nil : {
                            Task {
                                if let id = env.appState.selectedDeviceID {
                                    await env.agentDevices.requestDiscovery(deviceId: id)
                                    await env.agentDevices.refresh(deviceId: id)
                                }
                            }
                        }
                    )
                } else {
                    List(env.agentDevices.applications) { app in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(app.name).font(DXFont.body(15).weight(.medium)).foregroundStyle(DXColor.textPrimary)
                            Text("\(app.hostServer) · \(app.status)")
                                .font(DXFont.mono(12)).foregroundStyle(DXColor.textSecondary)
                            if !app.listenAddresses.isEmpty {
                                Text(app.listenAddresses.joined(separator: ", "))
                                    .font(DXFont.mono(11)).foregroundStyle(DXColor.textMuted)
                            }
                        }
                        .listRowBackground(DXColor.bgSecondary)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Applications")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu("Device") {
                        ForEach(env.tailscale.devices) { d in
                            Button(d.name) {
                                deviceId = d.id
                                env.appState.select(device: d.id)
                                Task { await env.agentDevices.refresh(deviceId: d.id) }
                            }
                        }
                    }
                }
            }
            .task {
                if let id = env.appState.selectedDeviceID ?? env.tailscale.devices.first?.id {
                    deviceId = id
                    await env.agentDevices.refresh(deviceId: id)
                }
            }
        }
    }
}
