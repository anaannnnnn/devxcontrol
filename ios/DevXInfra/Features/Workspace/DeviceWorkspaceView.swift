import SwiftUI

enum WorkspaceSection: String, CaseIterable, Identifiable {
    case overview, terminal, files, containers, processes, network, applications, domains, logs, ai
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
}

struct DeviceWorkspaceView: View {
    @Environment(AppEnvironment.self) private var env
    let device: InfraDevice
    @State private var section: WorkspaceSection = .overview
    @State private var logContainerId: String?

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(WorkspaceSection.allCases) { item in
                        Button {
                            section = item
                        } label: {
                            Text(item.title)
                                .font(DXFont.mono(11, weight: .medium))
                                .foregroundStyle(section == item ? DXColor.bgPrimary : DXColor.textSecondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(section == item ? DXColor.neonPrimary : Color.clear, in: Capsule())
                                .overlay(Capsule().stroke(DXColor.borderInactive, lineWidth: section == item ? 0 : 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            DXHairline()
            sectionBody
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(DXColor.bgPrimary.ignoresSafeArea())
        .navigationTitle(device.name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { env.appState.select(device: device.id) }
        .task { await env.agentDevices.refresh(deviceId: device.id) }
    }

    private var header: some View {
        HStack(spacing: 10) {
            StatusDot(kind: device.statusKind)
            VStack(alignment: .leading, spacing: 2) {
                Text(device.magicDns ?? device.name)
                    .font(DXFont.mono(13, weight: .medium))
                    .foregroundStyle(DXColor.textPrimary)
                Text(device.primaryAddress ?? "No Tailscale IP")
                    .font(DXFont.mono(11))
                    .foregroundStyle(DXColor.textMuted)
            }
            Spacer()
            Text(device.os.rawValue.uppercased())
                .font(DXFont.eyebrow(10))
                .foregroundStyle(DXColor.textSecondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var sectionBody: some View {
        switch section {
        case .overview:
            overview
        case .terminal:
            TerminalPane(device: device)
        case .files:
            FilesPane(device: device)
        case .containers:
            containersPane
        case .processes:
            processesPane
        case .logs:
            logsPane
        case .applications:
            appsPane
        case .network:
            networkPane
        case .domains:
            EmptyStateView(
                title: "Domains",
                message: "Use Publish from Command Center to assign a Cloudflare/GoDaddy zone to a discovered app on this device.",
                systemImage: "globe"
            )
        case .ai:
            AIAssistantView(showsCloseButton: false)
        }
    }

    private var overview: some View {
        List {
            LabeledContent("Status") { Text(device.status.rawValue).font(DXFont.mono(13)) }
            LabeledContent("OS") { Text("\(device.os.rawValue) \(device.osVersion ?? "")").font(DXFont.mono(13)) }
            LabeledContent("Agent") {
                Text(device.agentEnrolled ? "Enrolled" : "Not enrolled")
                    .font(DXFont.mono(13))
                    .foregroundStyle(device.agentEnrolled ? DXColor.neonPrimary : DXColor.warning)
            }
            if let m = env.agentDevices.metrics {
                Section("Live metrics") {
                    if let cpu = m.cpuPct {
                        LabeledContent("CPU") { Text(String(format: "%.0f%%", cpu)).font(DXFont.mono(13)) }
                    }
                    if let used = m.memUsed, let total = m.memTotal, total > 0 {
                        LabeledContent("Memory") {
                            Text("\(ByteCountFormatter.string(fromByteCount: used, countStyle: .memory)) / \(ByteCountFormatter.string(fromByteCount: total, countStyle: .memory))")
                                .font(DXFont.mono(12))
                        }
                    }
                    if let load = m.load1 {
                        LabeledContent("Load 1m") { Text(String(format: "%.2f", load)).font(DXFont.mono(13)) }
                    }
                }
            } else if let blocked = env.agentDevices.blockedReason {
                Text(blocked).font(DXFont.mono(12)).foregroundStyle(DXColor.textMuted)
            }
            if !device.addresses.isEmpty {
                Section("Addresses") {
                    ForEach(device.addresses, id: \.self) { ip in
                        Text(ip).font(DXFont.mono(13)).foregroundStyle(DXColor.textSecondary)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .listStyle(.plain)
    }

    private var networkPane: some View {
        List {
            ForEach(device.addresses, id: \.self) { ip in
                Text(ip).font(DXFont.mono(14)).foregroundStyle(DXColor.textPrimary)
            }
        }
        .scrollContentBackground(.hidden)
    }

    private var containersPane: some View {
        Group {
            if env.agentDevices.containers.isEmpty {
                EmptyStateView(
                    title: "No containers",
                    message: env.agentDevices.blockedReason
                        ?? "Enroll agents/host on this machine so Docker inventory can appear.",
                    systemImage: "shippingbox",
                    actionTitle: "Refresh",
                    action: { Task { await env.agentDevices.refresh(deviceId: device.id) } }
                )
            } else {
                List(env.agentDevices.containers) { c in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(c.name).font(DXFont.mono(13, weight: .medium)).foregroundStyle(DXColor.textPrimary)
                        Text("\(c.image ?? "—") · \(c.status ?? c.state ?? "—")")
                            .font(DXFont.mono(11)).foregroundStyle(DXColor.textSecondary)
                    }
                    .listRowBackground(DXColor.bgSecondary)
                    .swipeActions {
                        Button("Logs") {
                            logContainerId = c.id
                            section = .logs
                            Task { await env.agentDevices.fetchLogs(deviceId: device.id, containerId: c.id) }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var processesPane: some View {
        Group {
            if env.agentDevices.processes.isEmpty {
                EmptyStateView(
                    title: "No processes",
                    message: env.agentDevices.blockedReason
                        ?? "Process inventory requires an enrolled host agent reporting `ps` data.",
                    systemImage: "cpu",
                    actionTitle: "Refresh",
                    action: { Task { await env.agentDevices.refresh(deviceId: device.id) } }
                )
            } else {
                List(env.agentDevices.processes) { proc in
                    HStack(alignment: .top) {
                        Text("\(proc.pid)")
                            .font(DXFont.mono(12))
                            .foregroundStyle(DXColor.neonSecondary)
                            .frame(width: 56, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(proc.command)
                                .font(DXFont.mono(12))
                                .foregroundStyle(DXColor.textPrimary)
                                .lineLimit(1)
                            Text("\(proc.user ?? "—") · CPU \(String(format: "%.1f", proc.cpuPct ?? 0))% · MEM \(String(format: "%.1f", proc.memPct ?? 0))%")
                                .font(DXFont.mono(10))
                                .foregroundStyle(DXColor.textMuted)
                        }
                    }
                    .listRowBackground(DXColor.bgSecondary)
                }
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var logsPane: some View {
        VStack(spacing: 0) {
            if env.agentDevices.containers.isEmpty {
                EmptyStateView(
                    title: "No containers for logs",
                    message: env.agentDevices.blockedReason ?? "Host agent must report Docker containers before logs can be fetched.",
                    systemImage: "doc.text"
                )
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(env.agentDevices.containers) { c in
                            Button {
                                logContainerId = c.id
                                Task { await env.agentDevices.fetchLogs(deviceId: device.id, containerId: c.id) }
                            } label: {
                                Text(c.name)
                                    .font(DXFont.mono(11))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(logContainerId == c.id ? DXColor.neonPrimary : Color.clear)
                                    .foregroundStyle(logContainerId == c.id ? DXColor.bgPrimary : DXColor.textSecondary)
                                    .overlay(Capsule().stroke(DXColor.borderInactive))
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(12)
                }
                DXHairline()
                if let note = env.agentDevices.logNote, env.agentDevices.selectedLogText == nil {
                    Text(note)
                        .font(DXFont.mono(12))
                        .foregroundStyle(DXColor.warning)
                        .padding(12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                } else {
                    ScrollView {
                        Text(env.agentDevices.selectedLogText ?? "Select a container to fetch docker logs via the host agent.")
                            .font(DXFont.mono(11))
                            .foregroundStyle(DXColor.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                            .padding(12)
                    }
                }
            }
        }
    }

    private var appsPane: some View {
        Group {
            if env.agentDevices.applications.isEmpty {
                EmptyStateView(
                    title: "No applications",
                    message: env.agentDevices.blockedReason ?? "Run discovery via the host agent.",
                    systemImage: "app.badge",
                    actionTitle: "Scan",
                    action: {
                        Task {
                            await env.agentDevices.requestDiscovery(deviceId: device.id)
                            await env.agentDevices.refresh(deviceId: device.id)
                        }
                    }
                )
            } else {
                List(env.agentDevices.applications) { app in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(app.name).font(DXFont.mono(13)).foregroundStyle(DXColor.textPrimary)
                        Text(app.listenAddresses.joined(separator: ", "))
                            .font(DXFont.mono(11)).foregroundStyle(DXColor.textMuted)
                    }
                    .listRowBackground(DXColor.bgSecondary)
                }
                .scrollContentBackground(.hidden)
            }
        }
    }
}
