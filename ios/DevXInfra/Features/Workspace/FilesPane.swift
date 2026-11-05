import SwiftUI

struct FilesPane: View {
    @Environment(AppEnvironment.self) private var env
    let device: InfraDevice

    var body: some View {
        VStack(spacing: 12) {
            EmptyStateView(
                title: "SFTP unavailable",
                message: env.sftp.lastError
                    ?? "Browse remote files after a verified SSH session is connected. Directory listings are never fabricated for \(device.name).",
                systemImage: "folder",
                actionTitle: "Try list home",
                action: {
                    Task {
                        do { try await env.sftp.list(path: ".") }
                        catch { /* surfaced via lastError */ }
                    }
                }
            )
        }
    }
}
