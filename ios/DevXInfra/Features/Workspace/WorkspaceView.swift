import SwiftUI

struct WorkspaceView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        NavigationStack {
            Group {
                if let id = env.appState.selectedDeviceID,
                   let device = env.tailscale.devices.first(where: { $0.id == id }) {
                    DeviceWorkspaceView(device: device)
                } else if env.tailscale.devices.isEmpty {
                    EmptyStateView(
                        title: "No device selected",
                        message: "Load Tailscale devices from the Network tab, then open a device workspace. SSH and SFTP stay disabled until a real session can be established.",
                        systemImage: "laptopcomputer"
                    )
                } else {
                    List(env.tailscale.devices) { device in
                        Button {
                            env.appState.select(device: device.id)
                        } label: {
                            DeviceRow(device: device)
                        }
                        .listRowBackground(DXColor.bgSecondary)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Workspace")
        }
    }
}
