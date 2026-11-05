import SwiftUI

struct AIAssistantView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    var showsCloseButton: Bool = true
    @State private var draft = ""
    @State private var reply = ""
    @State private var tools: [ToolCall] = []
    @State private var busy = false
    @State private var error: String?
    @State private var blocked = false

    struct ToolCall: Identifiable, Decodable {
        var id: String { name + (ok == true ? "-ok" : "-err") + (error ?? "") }
        var name: String
        var ok: Bool?
        var error: String?
    }

    var body: some View {
        Group {
            if showsCloseButton {
                NavigationStack { chat.navigationTitle("AI Assistant").toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                } }
            } else {
                chat
            }
        }
    }

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Answers use structured Control tools (Tailscale, agents, DNS). No fabricated inventory.")
                        .dxText(.muted)
                    if blocked {
                        Text("LLM disconnected on Control — connect an AI endpoint under Connections.")
                            .font(DXFont.mono(12))
                            .foregroundStyle(DXColor.warning)
                    }
                    if let error {
                        Text(error).font(DXFont.mono(12)).foregroundStyle(DXColor.critical)
                    }
                    if !tools.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Tools").dxText(.eyebrow)
                            ForEach(tools) { tool in
                                HStack {
                                    StatusDot(kind: tool.ok == true ? .online : .critical, size: 6)
                                    Text(tool.name)
                                        .font(DXFont.mono(11))
                                        .foregroundStyle(DXColor.textSecondary)
                                    if let err = tool.error {
                                        Text(err)
                                            .font(DXFont.mono(10))
                                            .foregroundStyle(DXColor.critical)
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                    if !reply.isEmpty {
                        Text(reply)
                            .font(DXFont.body(14))
                            .foregroundStyle(DXColor.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(DXColor.borderInactive))
                    }
                }
                .padding(16)
            }
            DXHairline()
            HStack(spacing: 8) {
                TextField("Ask anything…", text: $draft)
                    .textInputAutocapitalization(.never)
                    .padding(12)
                    .font(DXFont.body(15))
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(draft.isEmpty || busy ? DXColor.textMuted : DXColor.neonPrimary)
                }
                .disabled(draft.isEmpty || busy)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(DXColor.bgSecondary)
        }
        .background(DXColor.bgPrimary.ignoresSafeArea())
    }

    private func send() async {
        busy = true
        error = nil
        defer { busy = false }
        struct Body: Encodable { var text: String; var deviceId: String? }
        do {
            let data = try await env.apiClient.send(
                method: "POST",
                path: "infra/ai/chat",
                body: Body(text: draft, deviceId: env.appState.selectedDeviceID)
            )
            struct Resp: Decodable {
                var reply: String?
                var blocked: Bool?
                var tools: [ToolCall]?
            }
            let resp = try await env.apiClient.decode(Resp.self, from: data)
            reply = resp.reply ?? ""
            tools = resp.tools ?? []
            blocked = resp.blocked == true
            draft = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}
