import SwiftUI
import UniformTypeIdentifiers

struct FilesPane: View {
    @Environment(AppEnvironment.self) private var env
    let device: InfraDevice
    @State private var path = "."
    @State private var error: String?
    @State private var newName = ""
    @State private var renaming: RemoteFileItem?
    @State private var showImporter = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(env.sftp.cwd)
                    .font(DXFont.mono(12))
                    .foregroundStyle(DXColor.textSecondary)
                    .lineLimit(1)
                Spacer()
                Button("Up") { Task { await goUp() } }
                    .font(DXFont.mono(11))
                    .disabled(!env.sftp.isAvailable)
                Button("Refresh") { Task { await reload() } }
                    .font(DXFont.mono(11))
                Button("Upload") { showImporter = true }
                    .font(DXFont.mono(11))
                    .disabled(!env.sftp.isAvailable)
            }
            .padding(10)
            DXHairline()

            if !env.sftp.isAvailable {
                EmptyStateView(
                    title: "SFTP unavailable",
                    message: "Connect SSH in the Terminal tab with a verified host key first. Listings are never fabricated for \(device.name).",
                    systemImage: "folder"
                )
            } else if env.sftp.entries.isEmpty {
                EmptyStateView(
                    title: "Empty or not loaded",
                    message: error ?? env.sftp.lastError ?? "Pull to load this directory from the remote host.",
                    systemImage: "folder",
                    actionTitle: "List \(path)",
                    action: { Task { await reload() } }
                )
            } else {
                List {
                    ForEach(env.sftp.entries) { item in
                        HStack {
                            Image(systemName: item.isDirectory ? "folder" : "doc")
                                .foregroundStyle(DXColor.neonPrimary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name).font(DXFont.mono(13)).foregroundStyle(DXColor.textPrimary)
                                if let size = item.size, !item.isDirectory {
                                    Text(ByteCountFormatter.string(fromByteCount: size, countStyle: .file))
                                        .font(DXFont.mono(10)).foregroundStyle(DXColor.textMuted)
                                }
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if item.isDirectory {
                                path = item.path
                                Task { await reload() }
                            }
                        }
                        .swipeActions {
                            Button("Rename") { renaming = item; newName = item.name }
                            Button("Delete", role: .destructive) {
                                Task {
                                    do { try await env.sftp.remove(path: item.path, isDirectory: item.isDirectory) }
                                    catch { self.error = error.localizedDescription }
                                }
                            }
                            if !item.isDirectory {
                                Button("Download") {
                                    Task {
                                        do {
                                            let data = try await env.sftp.download(path: item.path)
                                            // Share via temp file
                                            let url = FileManager.default.temporaryDirectory.appendingPathComponent(item.name)
                                            try data.write(to: url)
                                            error = "Downloaded to \(url.lastPathComponent) (tmp)."
                                        } catch { self.error = error.localizedDescription }
                                    }
                                }
                            }
                        }
                        .listRowBackground(DXColor.bgSecondary)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            if let error {
                Text(error).font(DXFont.mono(11)).foregroundStyle(DXColor.warning).padding(8)
            }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.data, .item], allowsMultipleSelection: false) { result in
            Task {
                do {
                    let urls = try result.get()
                    guard let url = urls.first else { return }
                    let accessed = url.startAccessingSecurityScopedResource()
                    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                    let data = try Data(contentsOf: url)
                    let dest = path == "." ? url.lastPathComponent : "\(path)/\(url.lastPathComponent)"
                    try await env.sftp.upload(data: data, to: dest)
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
        .alert("Rename", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("New name", text: $newName)
            Button("Save") {
                guard let item = renaming else { return }
                let parent = (item.path as NSString).deletingLastPathComponent
                let dest = parent == "" || parent == "." ? newName : "\(parent)/\(newName)"
                Task {
                    do { try await env.sftp.rename(from: item.path, to: dest) }
                    catch { self.error = error.localizedDescription }
                    renaming = nil
                }
            }
            Button("Cancel", role: .cancel) { renaming = nil }
        }
        .task { if env.sftp.isAvailable { await reload() } }
    }

    private func reload() async {
        do {
            try await env.sftp.list(path: path)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func goUp() async {
        if path == "." || path == "/" { return }
        path = (path as NSString).deletingLastPathComponent
        if path.isEmpty { path = "." }
        await reload()
    }
}
