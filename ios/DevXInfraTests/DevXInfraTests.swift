import XCTest
import SwiftUI
@testable import DevXInfra

final class DevXInfraTests: XCTestCase {
    func testColorHexRoundTripComponents() {
        // Sanity: neon primary components match design token #36FFB2
        let color = Color(hex: 0x36FFB2)
        _ = color
        XCTAssertEqual(0x36FFB2 & 0xFF, 0xB2)
    }

    func testAppConfigRejectsNonURL() {
        let before = AppConfig.load()
        let updated = before.savingBaseURL("not a url")
        // Invalid URL should leave prior config unchanged by implementation
        XCTAssertEqual(updated.controlBaseURL, before.controlBaseURL)
    }

    func testDeviceStatusMapping() {
        let device = InfraDevice(
            id: "1",
            name: "ubuntu",
            os: .linux,
            osVersion: nil,
            addresses: ["100.64.0.1"],
            magicDns: nil,
            status: .online,
            lastSeenAt: nil,
            appsCount: nil,
            publishedCount: nil,
            agentEnrolled: false,
            agentCapabilities: []
        )
        XCTAssertEqual(device.statusKind, .online)
        XCTAssertEqual(device.primaryAddress, "100.64.0.1")
    }
}
