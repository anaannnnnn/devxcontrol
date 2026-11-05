import SwiftUI

struct DomainsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var service: DomainsService?

    var body: some View {
        NavigationStack {
            Group {
                if let service {
                    content(service)
                } else {
                    ProgressView().tint(DXColor.neonPrimary)
                }
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("Domains")
            .task {
                let svc = DomainsService(api: env.apiClient, session: env.sessionStore)
                service = svc
                await svc.refresh()
            }
        }
    }

    @ViewBuilder
    private func content(_ service: DomainsService) -> some View {
        if service.isLoading && service.domains.isEmpty {
            ProgressView().tint(DXColor.neonPrimary).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if service.domains.isEmpty {
            EmptyStateView(
                title: "No domains",
                message: service.blockedReason
                    ?? "Connect Cloudflare or GoDaddy in DevX Control, then pull to refresh.",
                systemImage: "globe",
                actionTitle: "Refresh",
                action: { Task { await service.refresh() } }
            )
        } else {
            List(service.domains) { domain in
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(domain.name)
                            .font(DXFont.mono(14, weight: .medium))
                            .foregroundStyle(DXColor.textPrimary)
                        Text(domain.provider.uppercased())
                            .font(DXFont.eyebrow(10))
                            .foregroundStyle(DXColor.textMuted)
                    }
                    Spacer()
                    StatusDot(kind: .online)
                }
                .listRowBackground(DXColor.bgSecondary)
            }
            .scrollContentBackground(.hidden)
            .refreshable { await service.refresh() }
        }
    }
}
