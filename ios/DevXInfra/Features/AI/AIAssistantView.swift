import SwiftUI

struct AIAssistantView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                EmptyStateView(
                    title: "AI assistant idle",
                    message: "Prompts are sent to the control backend AI tools with confirm-gated mutations. Configure an LLM connection on Control before expecting replies. No tool results are invented on-device.",
                    systemImage: "sparkles"
                )
                DXHairline()
                HStack(spacing: 8) {
                    TextField("Ask anything…", text: $draft)
                        .textInputAutocapitalization(.never)
                        .padding(12)
                        .font(DXFont.body(15))
                        .foregroundStyle(DXColor.textPrimary)
                    Button {
                        draft = ""
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(draft.isEmpty ? DXColor.textMuted : DXColor.neonPrimary)
                    }
                    .disabled(draft.isEmpty)
                    .accessibilityLabel("Send — disabled until AI backend is wired and configured")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(DXColor.bgSecondary)
            }
            .background(DXColor.bgPrimary.ignoresSafeArea())
            .navigationTitle("AI Assistant")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
