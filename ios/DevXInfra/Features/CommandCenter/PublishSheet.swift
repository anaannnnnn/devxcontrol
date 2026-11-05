import SwiftUI

struct PublishSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var subdomain = ""
    @State private var selectedDomain: String?
    @State private var selectedAppId: String?
    @State private var domains: [InfraDomain] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Application") {
                    if env.agentDevices.applications.isEmpty {
                        Text("No discovered apps. Run host-agent discovery first.")
                            .foregroundStyle(DXColor.textSecondary)
                    } else {
                        Picker("App", selection: $selectedAppId) {
                            Text("Select").tag(String?.none)
                            ForEach(env.agentDevices.applications) { app in
                                Text("\(app.name) @ \(app.hostServer)").tag(Optional(app.id))
                            }
                        }
                    }
                }
                Section("Domain") {
                    Picker("Zone", selection: $selectedDomain) {
                        Text("Select").tag(String?.none)
                        ForEach(domains) { d in
                            Text("\(d.name) (\(d.provider))").tag(Optional(d.name))
                        }
                    }
                    TextField("subdomain", text: $subdomain)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section("Status") {
                    if let op = env.publish.lastOperation {
                        Text(op.status ?? "—").font(DXFont.mono(13))
                        ForEach(op.stages ?? []) { stage in
                            HStack {
                                StatusDot(kind: stage.ok ? .online : .critical, size: 6)
                                VStack(alignment: .leading) {
                                    Text(stage.stage).font(DXFont.mono(12, weight: .medium))
                                    if let detail = stage.detail {
                                        Text(detail).font(DXFont.mono(11)).foregroundStyle(DXColor.textSecondary)
                                    }
                                }
                            }
                        }
                        Text("LIVE is never claimed without verification. Failed stages stay failed.")
                            .font(DXFont.mono(11))
                            .foregroundStyle(DXColor.textMuted)
                    } else if let err = env.publish.lastError {
                        Text(err).foregroundStyle(DXColor.critical)
                    } else {
                        Text("Publish writes DNS when possible and reports honest tunnel gaps.")
                            .foregroundStyle(DXColor.textSecondary)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(DXColor.bgPrimary)
            .navigationTitle("Publish")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Publish") { runPublish() }
                        .disabled(selectedAppId == nil || selectedDomain == nil || subdomain.isEmpty)
                }
            }
            .task {
                let svc = DomainsService(api: env.apiClient, session: env.sessionStore)
                await svc.refresh()
                domains = svc.domains
                if let id = env.appState.selectedDeviceID {
                    await env.agentDevices.refresh(deviceId: id)
                }
            }
        }
    }

    private func runPublish() {
        guard let appId = selectedAppId, let domain = selectedDomain else { return }
        let deviceId = env.agentDevices.applications.first(where: { $0.id == appId })?.deviceId
            ?? env.appState.selectedDeviceID
            ?? ""
        let provider = domains.first(where: { $0.name == domain })?.provider
        Task {
            await env.publish.publish(
                deviceId: deviceId,
                applicationId: appId,
                domain: domain,
                subdomain: subdomain,
                provider: provider
            )
        }
    }
}
