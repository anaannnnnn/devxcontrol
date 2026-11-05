import SwiftUI

enum AppTab: String, CaseIterable, Identifiable {
    case commandCenter
    case network
    case applications
    case domains
    case workspace

    var id: String { rawValue }

    var title: String {
        switch self {
        case .commandCenter: "Command"
        case .network: "Network"
        case .applications: "Apps"
        case .domains: "Domains"
        case .workspace: "Workspace"
        }
    }

    var systemImage: String {
        switch self {
        case .commandCenter: "square.grid.2x2"
        case .network: "point.3.connected.trianglepath.dotted"
        case .applications: "app.badge"
        case .domains: "globe"
        case .workspace: "laptopcomputer"
        }
    }
}

struct MainTabShell: View {
    @Environment(AppEnvironment.self) private var env
    @State private var tab: AppTab = .commandCenter
    @State private var showPublish = false
    @State private var showAI = false
    @State private var showActivity = false
    @State private var showSettings = false

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $tab) {
                CommandCenterView(
                    onOpenAI: { showAI = true },
                    onOpenActivity: { showActivity = true },
                    onOpenSettings: { showSettings = true },
                    onPublish: { showPublish = true }
                )
                .tag(AppTab.commandCenter)
                .tabItem { Label(AppTab.commandCenter.title, systemImage: AppTab.commandCenter.systemImage) }

                NetworkView()
                    .tag(AppTab.network)
                    .tabItem { Label(AppTab.network.title, systemImage: AppTab.network.systemImage) }

                ApplicationsView()
                    .tag(AppTab.applications)
                    .tabItem { Label(AppTab.applications.title, systemImage: AppTab.applications.systemImage) }

                DomainsView()
                    .tag(AppTab.domains)
                    .tabItem { Label(AppTab.domains.title, systemImage: AppTab.domains.systemImage) }

                WorkspaceView()
                    .tag(AppTab.workspace)
                    .tabItem { Label(AppTab.workspace.title, systemImage: AppTab.workspace.systemImage) }
            }
            .tint(DXColor.neonPrimary)

            if tab == .commandCenter {
                PublishFAB { showPublish = true }
                    .padding(.bottom, 56)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .toolbarBackground(DXColor.bgSecondary, for: .tabBar)
        .sheet(isPresented: $showPublish) {
            PublishSheet()
        }
        .sheet(isPresented: $showAI) {
            AIAssistantView()
        }
        .sheet(isPresented: $showActivity) {
            ActivityView()
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .task {
            await env.backend.refresh()
            await env.tailscale.refresh()
        }
    }
}
