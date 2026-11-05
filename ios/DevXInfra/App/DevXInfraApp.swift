import SwiftUI

@main
struct DevXInfraApp: App {
    @State private var environment = AppEnvironment.bootstrap()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .preferredColorScheme(.dark)
        }
    }
}
