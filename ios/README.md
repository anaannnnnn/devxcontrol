# DevXInfra — open in Xcode

## Open → sign → run

1. On a Mac with Xcode 16+:
   ```bash
   git clone https://github.com/anaannnnnn/devxcontrol.git
   cd devxcontrol
   open ios/DevXInfra.xcodeproj
   ```
2. Wait for SPM to resolve **Citadel** (SSH/SFTP).
3. Select target **DevXInfra** → **Signing & Capabilities** → choose your **Team** (Automatic signing).
4. Pick an iPhone Simulator or device → **Run** (⌘R).

Bundle ID: `online.devxpert.DevXInfra` · iOS 17+ · Scheme: `DevXInfra`

## Unsigned IPA (Mac only)

Cloud/Linux agents cannot compile an IPA — there is no Xcode here. On your Mac:

```bash
chmod +x ios/scripts/build_unsigned_ipa.sh
./ios/scripts/build_unsigned_ipa.sh
# → ios/build/unsigned-ipa/DevXInfra-unsigned.ipa
```

Built with `CODE_SIGNING_ALLOWED=NO` (no Team, no codesign). Device install still needs you to re-sign or sideload with your own tooling.

## First launch

1. Unlock (device passcode / biometrics).
2. Enter your **DevX Control** base URL + admin credentials.
3. On Control: Connections → Tailscale API key; Cloudflare/GoDaddy as needed; enroll `agents/host` for containers/discovery.

Without those credentials the UI stays honestly empty — it will not invent devices or sessions.
