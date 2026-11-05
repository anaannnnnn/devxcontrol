import Foundation
import Observation

@Observable
@MainActor
final class AppState {
    var selectedDeviceID: String?
    var selectedApplicationID: String?
    var lastError: String?
    var commandQuery: String = ""

    func select(device id: String?) {
        selectedDeviceID = id
    }
}
