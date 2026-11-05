import SwiftUI

struct TopologyCanvas: View {
    let devices: [InfraDevice]
    @State private var pulse = false

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                // Wireframe rings
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .stroke(DXColor.neonPrimary.opacity(0.12 + Double(i) * 0.05), lineWidth: 1)
                        .frame(width: 70 + CGFloat(i) * 54, height: 70 + CGFloat(i) * 54)
                        .position(center)
                }
                Circle()
                    .stroke(DXColor.neonPrimary.opacity(pulse && !DXMotion.reduceMotion ? 0.55 : 0.35), lineWidth: 1.5)
                    .frame(width: 56, height: 56)
                    .position(center)
                    .neonGlow(active: true, radius: 12)
                Text("TAILNET")
                    .font(DXFont.eyebrow(9))
                    .foregroundStyle(DXColor.neonPrimary)
                    .position(center)

                ForEach(Array(devices.enumerated()), id: \.element.id) { index, device in
                    let angle = (Double(index) / Double(max(devices.count, 1))) * 2 * Double.pi - Double.pi / 2
                    let radius = min(geo.size.width, geo.size.height) * 0.34
                    let point = CGPoint(
                        x: center.x + CGFloat(cos(angle)) * radius,
                        y: center.y + CGFloat(sin(angle)) * radius
                    )
                    DeviceNodeView(device: device)
                        .position(point)
                }
            }
            .onAppear {
                guard !DXMotion.reduceMotion else { return }
                withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
        }
        .padding(12)
    }
}

struct DeviceNodeView: View {
    let device: InfraDevice

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(device.status == .online ? DXColor.borderActive : DXColor.borderInactive, lineWidth: 1)
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .light))
                    .foregroundStyle(device.status == .online ? DXColor.neonPrimary : DXColor.textMuted)
            }
            Text(device.name)
                .font(DXFont.mono(9))
                .foregroundStyle(device.status == .online ? DXColor.textPrimary : DXColor.textMuted)
                .lineLimit(1)
                .frame(width: 78)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(device.name), \(device.statusKind.label)")
    }

    private var icon: String {
        switch device.os {
        case .macos, .ios: "laptopcomputer"
        case .windows: "pc"
        case .linux: "server.rack"
        default: "cpu"
        }
    }
}
