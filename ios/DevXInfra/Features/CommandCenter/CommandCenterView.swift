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
                    if !env.overview.notes.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Notes").dxText(.eyebrow)
                            ForEach(env.overview.notes, id: \.self) { note in
                                Text("• \(note)").dxText(.muted)
                            }
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 88)
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("DevXInfra").font(DXFont.eyebrow(12)).foregroundStyle(DXColor.neonPrimary)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button(action: onOpenActivity) { Image(systemName: "bell") }
                    Button(action: onOpenAI) { Image(systemName: "sparkles") }
                    Button(action: onOpenSettings) { Image(systemName: "gearshape") }
                }
            }
            .toolbarBackground(DXColor.bgPrimary, for: .navigationBar)
            .refreshable {
                await env.backend.refresh()
                await env.tailscale.refresh()
                await env.overview.refresh()
            }
            .task {
                await env.overview.refresh()
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
                ForEach(env.overview.integrations) { item in
                    IntegrationPill(title: item.id.capitalized, connected: item.isConnected, detail: item.detail)
                }
                if env.overview.integrations.isEmpty {
                    IntegrationPill(title: "Tailscale", connected: env.tailscale.isConnected)
                    IntegrationPill(title: "Cloudflare", connected: env.backend.cloudflareConnected)
                    IntegrationPill(title: "GoDaddy", connected: env.backend.godaddyConnected)
                    IntegrationPill(title: "Control", connected: env.backend.isReachable)
                }
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
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive, lineWidth: 1))
            } else {
                TopologyCanvas(devices: env.tailscale.devices)
                    .frame(height: 260)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive, lineWidth: 1))
            }
        }
    }

    private var metrics: some View {
        let online = env.overview.devicesOnline.map(String.init)
            ?? (env.tailscale.devices.isEmpty ? "—" : "\(env.tailscale.onlineCount)")
        let total = env.overview.devicesTotal.map(String.init)
            ?? (env.tailscale.devices.isEmpty ? "—" : "\(env.tailscale.devices.count)")
        let apps = env.overview.applicationsTotal.map(String.init) ?? "—"
        let domains = env.overview.domainsTotal.map(String.init) ?? "—"
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            MetricTile(label: "Devices", value: "\(online) / \(total)", subtitle: "Online / total")
            MetricTile(label: "Apps", value: apps, subtitle: apps == "—" ? "Needs host agent" : "Discovered")
            MetricTile(label: "Links", value: "—", subtitle: "After publish")
            MetricTile(label: "Domains", value: domains, subtitle: "DNS providers")
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
            if env.overview.activity.isEmpty {
                Text("Activity appears when Control and agents report events. Nothing is fabricated here.")
                    .dxText(.muted)
            } else {
                ForEach(env.overview.activity.prefix(5)) { event in
                    HStack(alignment: .top, spacing: 8) {
                        StatusDot(kind: event.statusType == "ok" ? .online : event.statusType == "bad" ? .critical : .warning, size: 6)
                        Text(event.message).font(DXFont.body(13)).foregroundStyle(DXColor.textSecondary)
                    }
                }
            }
        }
    }
}
