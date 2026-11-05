#!/usr/bin/env bash
# Build an UNSIGNED device IPA on macOS (no Apple Team / no codesign).
# Requires: Xcode 16+, macOS. Does NOT run on Linux cloud agents.
#
# Usage (from repo root or ios/):
#   ./ios/scripts/build_unsigned_ipa.sh
#   ./ios/scripts/build_unsigned_ipa.sh /path/to/output-dir
#
# Output: DevXInfra-unsigned.ipa
# Note: Installing on a physical iPhone still needs signing (or a sideload tool).
# This artifact is for local packaging / later re-sign with your cert.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: unsigned IPA build requires macOS + Xcode. This environment is $(uname -s)." >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null; then
  echo "error: xcodebuild not found. Install Xcode and run: xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${1:-$IOS_DIR/build/unsigned-ipa}"
DERIVED="$OUT_DIR/DerivedData"
PAYLOAD="$OUT_DIR/Payload"
IPA="$OUT_DIR/DevXInfra-unsigned.ipa"
SCHEME="DevXInfra"
PROJECT="$IOS_DIR/DevXInfra.xcodeproj"

rm -rf "$OUT_DIR"
mkdir -p "$DERIVED"

echo "==> Building Release for iphoneos (CODE_SIGNING_ALLOWED=NO)…"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$DERIVED" \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  build

APP="$(find "$DERIVED/Build/Products" -type d -name 'DevXInfra.app' | head -n 1)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "error: DevXInfra.app not found under $DERIVED/Build/Products" >&2
  exit 1
fi

echo "==> Packaging $APP → $IPA"
mkdir -p "$PAYLOAD"
cp -R "$APP" "$PAYLOAD/DevXInfra.app"
(
  cd "$OUT_DIR"
  rm -f DevXInfra-unsigned.ipa
  zip -qry DevXInfra-unsigned.ipa Payload
)

python3 - <<PY
import hashlib, pathlib
ipa = pathlib.Path(r"""$IPA""")
h = hashlib.sha256(ipa.read_bytes()).hexdigest()
print(f"OK — unsigned IPA: {ipa}")
print(f"size: {ipa.stat().st_size} bytes")
print(f"sha256: {h}")
print("CODESIGN: none (CODE_SIGNING_ALLOWED=NO)")
PY
