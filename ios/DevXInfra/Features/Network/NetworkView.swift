import SwiftUI

struct NetworkView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var query = ""

    private var filtered: [InfraDevice] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return env.tailscale.devices }
        return env.tailscale.devices.filter {
            $0.name.lowercased().contains(q)
                || ($0.magicDns?.lowercased().contains(q) ?? false)
                || $0.addresses.contains { $0.contains(q) }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if env.tailscale.isLoading && env.tailscale.devices.isEmpty {
                    ProgressView().tint(DXColor.neonPrimary).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if env.tailscale.devices.isEmpty {
                    EmptyStateView(
                        title: "Tailscale network unavailable",
                        message: env.tailscale.blockedReason
                            ?? "Connect Control to a Tailscale API credential and enable /api/v1/infra/tailscale/devices.",
                        systemImage: "point.3.connected.trianglepath.dotted"
                    )
                } else {
                    List {
                        ForEach(filtered) { device in
                            NavigationLink(value: device.id) {
                                DeviceRow(device: device)
                            }
                            .listRowBackground(DXColor.bgSecondary)
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .navigationDestination(for: String.self) { id in
                        if let device = env.tailscale.devices.first(where: { $0.id == id }) {
                            DeviceWorkspaceView(device: device)
                        }
                    }
                }
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Network")
            .searchable(text: $query, prompt: "Search devices, IPs, MagicDNS")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await env.tailscale.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .task { await env.tailscale.refresh() }
        }
    }
}

struct DeviceRow: View {
    let device: InfraDevice

    var body: some View {
        HStack(spacing: 12) {
            StatusDot(kind: device.statusKind)
            VStack(alignment: .leading, spacing: 4) {
                Text(device.name)
                    .font(DXFont.body(15).weight(.medium))
                    .foregroundStyle(DXColor.textPrimary)
                Text(device.primaryAddress ?? device.magicDns ?? "No address")
                    .font(DXFont.mono(12))
                    .foregroundStyle(DXColor.textSecondary)
            }
            Spacer()
            if device.agentEnrolled {
                Text("AGENT")
                    .font(DXFont.eyebrow(9))
                    .foregroundStyle(DXColor.neonSecondary)
            }
        }
        .padding(.vertical, 4)
    }
}
