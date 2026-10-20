#!/usr/bin/env python3
"""Write the OTA build metadata into an OpenWrt/LEDE source tree.

luci-app-ota needs to know which firmware it is running and when it was built.
The information is written into the image as ``/etc/ota/build.json`` before the
firmware is compiled:

    {
      "dist": "ZeroWrt",
      "version": "20261020",
      "device": "ruijie_rg-x60-new",
      "model": "ruijie,rg-x60-new",
      "target": "mediatek/filogic",
      "build_date": 1774124635
    }

The same values have to be used when generating the update index, otherwise
the version comparison in the plugin will be wrong. ``--emit`` writes a
machine readable copy of the metadata next to the build artifacts so that the
index generator can pick it up later.

Usage (inside a build tree::

    python3 tools/embed_ota_meta.py --tree /builder/lede \\
        --info /builder/lede/.zerowrt-info.json --emit ./ota-meta.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

BUILD_JSON = Path("package/base-files/files/etc/ota/build.json")
UCI_DEFAULTS = Path("package/base-files/files/etc/uci-defaults/90-luci-app-ota")

UCI_DEFAULTS_TEMPLATE = """#!/bin/sh
# Set the default OTA index URL once. A URL the user configured already wins,
# so this only runs on a fresh install or after a settings-wiping upgrade.
[ -f /etc/config/ota ] || exit 0
[ -n "$(uci -q get ota.config.api_url)" ] && exit 0
uci -q set ota.config.api_url='{url}'
uci -q commit ota
exit 0
"""


def log(message: str) -> None:
    print(f"[ota] {message}", flush=True)


def model_from_device(device: str) -> str:
    """Guess the device tree compatible string from the profile name."""
    if not device or "x86" in device.lower():
        return ""
    vendor, _, rest = device.partition("_")
    if vendor and rest:
        return f"{vendor},{rest}"
    return ""


def load_tree_info(tree: Path, info_path: str) -> dict:
    data: dict = {}
    candidate = Path(info_path) if info_path else tree / ".zerowrt-info.json"
    if not candidate.is_absolute():
        candidate = tree / candidate
    if candidate.exists():
        try:
            loaded = json.loads(candidate.read_text(encoding="utf-8-sig"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, json.JSONDecodeError) as exc:
            log(f"warning: cannot read {candidate}: {exc}")
    return data


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Embed OTA metadata into an OpenWrt build tree")
    parser.add_argument("--tree", required=True, help="path to the OpenWrt/LEDE source tree")
    parser.add_argument("--info", default="", help="path to .zerowrt-info.json (default: <tree>/.zerowrt-info.json)")
    parser.add_argument("--device", default="", help="device profile name (overrides the build info)")
    parser.add_argument("--model", default="", help="device tree compatible string, e.g. ruijie,rg-x60-new")
    parser.add_argument("--target", default="", help="target, e.g. mediatek/filogic")
    parser.add_argument("--version", default="", help="firmware version string")
    parser.add_argument("--dist-name", default="", help="distribution name (default: build info, else ZeroWrt)")
    parser.add_argument("--build-date", type=int, default=0, help="build timestamp (default: current time)")
    parser.add_argument("--emit", default="", help="write a copy of the metadata to this file")
    parser.add_argument("--api-url", default="",
                        help="default update index URL baked into the firmware")
    parser.add_argument("--no-source-date", action="store_true",
                        help="do not write <tree>/version.date")
    parser.add_argument("--print", action="store_true", help="print the metadata as JSON")
    args = parser.parse_args(argv)

    tree = Path(args.tree)
    if not (tree / "rules.mk").exists():
        log(f"error: {tree} does not look like an OpenWrt/LEDE tree")
        return 2

    info = load_tree_info(tree, args.info)

    board = str(info.get("board", ""))
    subtarget = str(info.get("subtarget", ""))
    device = args.device or str(info.get("device", ""))
    target = args.target or (f"{board}/{subtarget}" if board and subtarget else "")
    version = args.version or str(info.get("version", ""))
    dist_name = args.dist_name or str(info.get("dist", "")) or "ZeroWrt"
    model = args.model or model_from_device(device)

    # Human readable product name, used by the download page. "Generic" is the
    # placeholder vendor of the x86 profiles and is not worth showing.
    vendor = str(info.get("device_vendor", "")).strip()
    model_name = str(info.get("device_model", "")).strip()
    product = " ".join(
        part for part in (vendor, model_name) if part and part.lower() != "generic"
    ).strip()

    if not version:
        version = time.strftime("%Y%m%d")

    build_date = args.build_date or int(time.time())

    if not device:
        log("error: no device name given and none found in the build info")
        return 2

    # Keep SOURCE_DATE_EPOCH in sync with the metadata we record. OpenWrt
    # exposes it as OPENWRT_BUILD_DATE in /etc/os-release and uses it for
    # reproducible builds; a missing file falls back to the git timestamp.
    if not args.no_source_date:
        (tree / "version.date").write_text(f"{build_date}\n", encoding="utf-8")
        log(f"wrote {tree / 'version.date'} = {build_date}")

    metadata = {
        "dist": dist_name,
        "version": version,
        "device": device,
        "model": model,
        "target": target,
        "build_date": build_date,
    }
    if product:
        metadata["product"] = product

    destination = tree / BUILD_JSON
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"wrote {destination}")

    if args.api_url:
        defaults = tree / UCI_DEFAULTS
        defaults.parent.mkdir(parents=True, exist_ok=True)
        defaults.write_text(UCI_DEFAULTS_TEMPLATE.format(url=args.api_url), encoding="utf-8")
        defaults.chmod(0o755)
        log(f"wrote {defaults} (api_url default = {args.api_url})")

    if args.emit:
        emitted = Path(args.emit)
        emitted.parent.mkdir(parents=True, exist_ok=True)
        emitted.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        log(f"wrote {emitted}")

    if args.print:
        print(json.dumps(metadata, indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
