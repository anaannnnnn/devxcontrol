#!/usr/bin/env python3
"""Static validation for DevXInfra Xcode project (runs on Linux without Xcode)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PBX = ROOT / "DevXInfra.xcodeproj" / "project.pbxproj"
SRC = ROOT / "DevXInfra"
FORBIDDEN = [
    re.compile(r"\bWIN-DEV-PC\b"),
    re.compile(r"Demo@12345"),
    re.compile(r"fakeDevices\s*="),
    re.compile(r"sampleFleet"),
    re.compile(r"TODO:\s*simulate", re.I),
]


def main() -> int:
    errors: list[str] = []
    if not PBX.is_file():
        errors.append(f"missing {PBX}")
    else:
        text = PBX.read_text()
        if "rootObject" not in text or "PBXNativeTarget" not in text:
            errors.append("project.pbxproj missing required sections")
        if "online.devxpert.DevXInfra" not in text:
            errors.append("bundle id missing from pbxproj")

    swift = list(SRC.rglob("*.swift"))
    if len(swift) < 20:
        errors.append(f"expected many Swift sources, found {len(swift)}")

    pbx = PBX.read_text() if PBX.is_file() else ""
    for path in swift:
        if path.name not in pbx:
            errors.append(f"{path.name} not referenced in project.pbxproj")
        src = path.read_text()
        if src.count("{") != src.count("}"):
            errors.append(f"brace mismatch in {path.relative_to(ROOT)}")
        for pat in FORBIDDEN:
            if pat.search(src):
                errors.append(f"forbidden pattern {pat.pattern} in {path.relative_to(ROOT)}")

    required = [
        SRC / "App" / "DevXInfraApp.swift",
        SRC / "DesignSystem" / "DXColor.swift",
        SRC / "Features" / "CommandCenter" / "CommandCenterView.swift",
        SRC / "Services" / "SSH" / "SSHService.swift",
        SRC / "Services" / "Tailscale" / "TailscaleService.swift",
        SRC / "Resources" / "Info.plist",
    ]
    for path in required:
        if not path.is_file():
            errors.append(f"missing required file {path}")

    color = (SRC / "DesignSystem" / "DXColor.swift").read_text()
    for token in ("0x030607", "0x36FFB2", "0x00D9FF"):
        if token not in color:
            errors.append(f"design token {token} missing from DXColor.swift")

    if "Citadel" not in pbx or "XCRemoteSwiftPackageReference" not in pbx:
        errors.append("Citadel SPM package reference missing from project.pbxproj")
    if "DevXInfra.entitlements" not in pbx:
        errors.append("entitlements file not referenced in project")
    if not (SRC / "Services" / "SSH" / "SSHService.swift").is_file():
        errors.append("SSHService.swift missing")

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print(f"OK — {len(swift)} Swift sources, pbxproj references present, design tokens found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
