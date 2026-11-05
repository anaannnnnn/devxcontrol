# DevXInfra (iOS)

Native SwiftUI client for **DevX Infrastructure OS**.

## Open in Xcode (macOS required)

```bash
open ios/DevXInfra.xcodeproj
```

- Deployment target: iOS 17+
- Bundle ID: `online.devxpert.DevXInfra`
- Swift 6

```bash
xcodebuild -project ios/DevXInfra.xcodeproj -scheme DevXInfra -destination 'platform=iOS Simulator,name=iPhone 16' build
```

This Linux environment cannot run `xcodebuild`. Use `python3 ios/scripts/validate_project.py` for static structure checks.

## What works in this scaffold

- Design tokens (`#030607` / `#36FFB2`) and Command Center shell
- Tabs: Command Center, Network, Applications, Domains, Workspace
- Keychain credential store, LocalAuthentication unlock, Control API client
- Tailscale device load via `/api/v1/infra/tailscale/devices` (honest empty if missing)
- Domains via existing `/api/v1/dns/domains`
- SSH/SFTP services that **refuse to simulate** a session until a real SSH library is linked

## Configure

1. Launch app → unlock → enter Control base URL + credentials
2. Connect Tailscale / DNS / LLM on the Control backend
3. Enroll a host agent for containers, metrics, discovery, publish
