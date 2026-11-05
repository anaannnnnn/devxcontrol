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
        case .containers, .processes, .logs, .applications:
            EmptyStateView(
                title: "Host agent required",
                message: "\(section.title) data is provided by an enrolled DevX Host Agent on \(device.name). Direct Tailscale inventory cannot supply containers, processes, or local app discovery.",
                systemImage: "shippingbox"
            )
        case .network:
            networkPane
        case .domains:
            EmptyStateView(
                title: "Domains",
                message: "Assign domains to services discovered on this device after agent scan + DNS providers are connected.",
                systemImage: "globe"
            )
        case .ai:
            EmptyStateView(
                title: "AI diagnostics",
                message: "AI tools run against real device context once Control AI + agent data are available. No fabricated diagnostics.",
                systemImage: "sparkles"
            )
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
}
