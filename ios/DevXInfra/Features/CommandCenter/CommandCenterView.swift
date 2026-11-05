import SwiftUI

struct CommandCenterView: View {
    @Environment(AppEnvironment.self) private var env
    var onOpenAI: () -> Void
    var onOpenActivity: () -> Void
    var onOpenSettings: () -> Void
    var onPublish: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    integrationRow
                    topology
                    metrics
                    activityPreview
                }
                .padding(20)
                .padding(.bottom, 88)
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("DevXInfra")
                        .font(DXFont.eyebrow(12))
                        .foregroundStyle(DXColor.neonPrimary)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button(action: onOpenActivity) {
                        Image(systemName: "bell")
                    }
                    Button(action: onOpenAI) {
                        Image(systemName: "sparkles")
                    }
                    Button(action: onOpenSettings) {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .toolbarBackground(DXColor.bgPrimary, for: .navigationBar)
            .refreshable {
                await env.backend.refresh()
                await env.tailscale.refresh()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Infrastructure Command Center")
                .font(DXFont.title(24))
                .foregroundStyle(DXColor.textPrimary)
            Text("Your connected infrastructure across Tailscale — live data only.")
                .dxText(.secondary)
        }
    }

    private var integrationRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                IntegrationPill(title: "Tailscale", connected: env.tailscale.isConnected)
                IntegrationPill(title: "Cloudflare", connected: env.backend.cloudflareConnected)
                IntegrationPill(title: "GoDaddy", connected: env.backend.godaddyConnected)
                IntegrationPill(title: "Control", connected: env.backend.isReachable)
            }
        }
    }

    @ViewBuilder
    private var topology: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("My Tailnet").dxText(.eyebrow)
            if let blocked = env.tailscale.blockedReason, env.tailscale.devices.isEmpty {
                EmptyStateView(
                    title: "No network data",
                    message: blocked,
                    systemImage: "point.3.connected.trianglepath.dotted",
                    actionTitle: "Open Settings",
                    action: onOpenSettings
                )
                .frame(minHeight: 220)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .stroke(DXColor.borderInactive, lineWidth: 1)
                )
            } else {
                TopologyCanvas(devices: env.tailscale.devices)
                    .frame(height: 260)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .stroke(DXColor.borderInactive, lineWidth: 1)
                    )
            }
        }
    }

    private var metrics: some View {
        let online = env.tailscale.devices.isEmpty ? "—" : "\(env.tailscale.onlineCount)"
        let total = env.tailscale.devices.isEmpty ? "—" : "\(env.tailscale.devices.count)"
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            MetricTile(label: "Devices", value: "\(online) / \(total)", subtitle: env.tailscale.devices.isEmpty ? "Unavailable" : "Online / total")
            MetricTile(label: "Apps", value: "—", subtitle: "Needs host agent")
            MetricTile(label: "Links", value: "—", subtitle: "Needs publish API")
            MetricTile(label: "Domains", value: env.backend.cloudflareConnected || env.backend.godaddyConnected ? "…" : "—", subtitle: "Open Domains tab")
        }
    }

    private var activityPreview: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Recent activity").dxText(.eyebrow)
                Spacer()
                Button("All", action: onOpenActivity)
                    .font(DXFont.mono(11))
                    .foregroundStyle(DXColor.neonSecondary)
            }
            Text("Activity events appear when the control backend and agents report them. Nothing is fabricated here.")
                .dxText(.muted)
        }
    }
}
