#!/usr/bin/env python3
"""Generate (or update) the JSON update index used by luci-app-ota.

The index maps a device key to the firmware image that should be installed on
that device:

    {
      "schema": 2,
      "generated": 1774124800,
      "dist": "ZeroWrt",
      "devices": {
        "x86_64": { "version": "...", "build_date": 1774124635,
                    "url": "https://...", "sha256": "...", "size": 1234 }
      }
    }

Only the Python standard library is used, so the script runs on a bare CI
runner as well as on a router.

Typical ZeroWrt usage, after the firmware has been built and published:

    tools/gen_ota_index.py --dist dist --out ota.json \\
        --repo MinimaxFlora/ZeroWrt --tag x86_64 --device x86_64 \\
        --label "Ruijie RG-X60" --existing ota.json \\
        --history history.json

``--history`` keeps a site-only ``history.json`` with every past release, which
is what the download page (``site/``) uses for its changelog. The plugin never
reads that file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

IMAGE_SUFFIXES = (".bin", ".img", ".img.gz", ".itb", ".trx", ".tar")

# Never part of an OTA entry.
BAD_TOKENS = (
    "factory",
    "initramfs",
    "vmlinux",
    "kernel",
    "rootfs.",
    "-rootfs",
    "uImage",
    "u-boot",
    "uboot",
    "recovery",
)

X86_BOARDS = ("x86", "x86_64")

# history.json is fetched by the download page, so keep it small.
HISTORY_CHANGELOG_LIMIT = 1200
DEFAULT_HISTORY_LIMIT = 120


def log(message: str) -> None:
    print(f"[ota] {message}", flush=True)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_checksums(dist: Path) -> dict[str, str]:
    """Parse a SHA256SUMS file into {filename: digest}."""
    result: dict[str, str] = {}
    for name in ("SHA256SUMS", "sha256sums", "SHA256SUM", "sha256sum.txt"):
        path = dist / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            match = re.match(r"^([0-9a-fA-F]{64})\s+\*?(.+)$", line)
            if match:
                result[Path(match.group(2).strip()).name] = match.group(1).lower()
    return result


def build_info(dist: Path) -> dict[str, str]:
    """Read the small ``key: value`` summary ZeroWrt writes to BUILD_INFO.txt."""
    path = dist / "BUILD_INFO.txt"
    if not path.exists():
        return {}
    info: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            info[key.strip().lower()] = value.strip()
    return info


def parse_build_date(text: str) -> int:
    for fmt in ("%Y-%m-%d %H:%M:%S UTC", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            parsed = datetime.strptime(text.strip(), fmt).replace(tzinfo=timezone.utc)
            return int(parsed.timestamp())
        except ValueError:
            continue
    return 0


def is_x86(target: str, device: str) -> bool:
    text = f"{target} {device}".lower()
    return any(token in text for token in X86_BOARDS)


def candidate_images(dist: Path, target: str, device: str) -> list[Path]:
    images = []
    for path in sorted(dist.iterdir()):
        if not path.is_file() or not path.name.endswith(IMAGE_SUFFIXES):
            continue
        if any(token.lower() in path.name.lower() for token in BAD_TOKENS):
            continue
        images.append(path)
    if not images:
        return []

    x86 = is_x86(target, device)

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        rank = 0
        if "sysupgrade" in name:
            rank += 10
        if "squashfs" in name:
            rank += 3
        if x86 and "combined" in name:
            rank += 5
        if "efi" in name:
            rank += 1
        if name.endswith(".gz"):
            rank += 1
        return (-rank, 0 if "ext4" in name else 1, name)

    return sorted(images, key=score)


def pick_efi_pair(images: list[Path]) -> tuple[Path | None, Path | None]:
    """Split x86 images into the legacy BIOS and the EFI variant."""
    bios = None
    efi = None
    for path in images:
        name = path.name.lower()
        if "combined" not in name:
            continue
        if "efi" in name:
            if efi is None:
                efi = path
        elif bios is None:
            bios = path
    return bios, efi


def asset_url(repo: str, tag: str, filename: str, url_base: str | None) -> str:
    if url_base:
        return f"{url_base.rstrip('/')}/{filename}"
    return f"https://github.com/{repo}/releases/download/{tag}/{filename}"


def sanitize_changelog(text: str) -> str:
    """The changelog ends up in the web UI; keep it small and text only."""
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return ""
    if len(text) > 4000:
        text = text[:4000] + "\n\n…"
    return text


def load_existing(path: str | None, url: str | None) -> dict:
    if path:
        p = Path(path)
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8-sig"))
                if isinstance(data, dict):
                    return data
            except (OSError, json.JSONDecodeError) as exc:
                log(f"ignoring unreadable existing index {p}: {exc}")
    if url:
        log(f"downloading existing index from {url}")
        try:
            with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310
                data = json.loads(response.read().decode("utf-8-sig"))
            if isinstance(data, dict):
                return data
        except Exception as exc:  # noqa: BLE001 - best effort merge only
            log(f"could not fetch existing index: {exc}")
    return {}


def device_keys(device: str, target: str, board: str, variant: str,
                include_plain: bool = True, aliases: bool = True) -> list[str]:
    """Keys the firmware is going to look up, most specific first.

    With ``aliases=False`` only the device name itself is published. That keeps
    the index small, but firmware built before the OTA metadata existed can
    only fall back to the device tree name, so the default keeps every alias.
    """
    keys: list[str] = []

    def add(key: str, suffix: str = "") -> None:
        if not key:
            return
        value = key + suffix
        if value and value not in keys:
            keys.append(value)

    base: list[str] = []
    for value in ((board, device) if aliases else (device,)):
        if value and value not in base:
            base.append(value)
    # "ruijie_rg-x60-new" is the profile name, "ruijie,rg-x60-new" the DT model
    if aliases and device and "_" in device and "x86" not in device.lower():
        vendor, _, rest = device.partition("_")
        if vendor and rest:
            derived = f"{vendor},{rest}"
            if derived not in base:
                base.append(derived)
    if aliases and "x86" in f"{target} {device}".lower():
        for value in ("x86_64", "x86/64", "generic"):
            if value not in base:
                base.append(value)

    for key in base:
        if variant:
            add(key, "+" + variant)
        if include_plain:
            add(key)

    return keys


def load_history(path: Path) -> dict:
    """Read history.json, tolerating a missing or broken file."""
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            if isinstance(data, dict) and isinstance(data.get("releases"), list):
                return data
        except (OSError, json.JSONDecodeError) as exc:
            log(f"ignoring unreadable history {path}: {exc}")
    return {"schema": 1, "releases": []}


def history_record(entry: dict) -> dict:
    """Trim an index entry down to what the web page needs."""
    record = {}
    for key in ("version", "build_date", "url", "sha256", "size", "file", "target",
                "device", "label", "variant"):
        if key in entry:
            record[key] = entry[key]
    record["changelog"] = entry.get("changelog", "")[:HISTORY_CHANGELOG_LIMIT]
    return record


def update_history(path: Path, records: list[dict], dist_name: str, limit: int) -> None:
    """Append this build to history.json (site-only file, newest first)."""
    history = load_history(path)
    releases = history["releases"]

    known = {
        (str(item.get("device", "")), str(item.get("variant", "")), int(item.get("build_date") or 0))
        for item in releases
        if isinstance(item, dict)
    }

    added = 0
    for entry in records:
        key = (str(entry.get("device", "")), str(entry.get("variant", "")),
               int(entry.get("build_date") or 0))
        if key in known:
            continue
        known.add(key)
        releases.append(history_record(entry))
        added += 1

    releases.sort(key=lambda item: (-int(item.get("build_date") or 0), str(item.get("device", ""))))

    history = {
        "schema": 1,
        "generated": int(time.time()),
        "dist": dist_name,
        "releases": releases[:limit],
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if added:
        log(f"history: +{added} release(s), {len(history['releases'])} kept in {path}")
    else:
        log(f"history: already up to date ({len(history['releases'])} releases)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the luci-app-ota update index")
    parser.add_argument("--dist", default="dist", help="directory with the firmware artifacts")
    parser.add_argument("--out", default="ota.json", help="output index file")
    parser.add_argument("--repo", default="", help="GitHub repository, e.g. owner/name")
    parser.add_argument("--tag", default="", help="release tag the assets are attached to")
    parser.add_argument("--device", default="", help="device profile name, e.g. ruijie_rg-x60-new")
    parser.add_argument("--board", default="", help="board name (DT compatible), e.g. ruijie,rg-x60-new")
    parser.add_argument("--label", default="", help="human readable device name, e.g. 'Ruijie RG-X60'")
    parser.add_argument("--target", default="", help="target, e.g. mediatek/filogic")
    parser.add_argument("--version", default="", help="firmware version string")
    parser.add_argument("--build-date", type=int, default=0, help="firmware build timestamp (epoch)")
    parser.add_argument("--dist-name", default="", help="distribution name stored in the index")
    parser.add_argument("--changelog", default="", help="changelog text (markdown)")
    parser.add_argument("--changelog-file", default="", help="file with the changelog (markdown)")
    parser.add_argument("--notes", default="", help="alias for --changelog-file")
    parser.add_argument("--image", default="", help="explicit firmware image to publish")
    parser.add_argument("--existing", default="", help="existing index file to merge into")
    parser.add_argument("--existing-url", default="", help="existing index URL to merge into")
    parser.add_argument("--url-base", default="", help="override the asset URL prefix")
    parser.add_argument("--variant", default="", help="variant suffix, e.g. efi or bios")
    parser.add_argument("--aliases", choices=("all", "canonical"), default="canonical",
                        help="publish only the device name (default) or every alias the plugin may probe")
    parser.add_argument("--history", default="",
                        help="history.json to append this release to (used by the download page)")
    parser.add_argument("--max-history", type=int, default=DEFAULT_HISTORY_LIMIT,
                        help=f"how many releases to keep in history.json (default {DEFAULT_HISTORY_LIMIT})")
    args = parser.parse_args(argv)

    dist = Path(args.dist)
    if not dist.is_dir():
        log(f"error: {dist} is not a directory")
        return 2

    info = build_info(dist)
    checksums = read_checksums(dist)

    target = args.target or info.get("tree", "")
    device = args.device or info.get("device", "").split(" ")[0]
    version = args.version or info.get("version", "")
    dist_name = args.dist_name or "ZeroWrt"
    label = args.label or info.get("product", "")

    build_date = args.build_date
    if build_date <= 0:
        build_date = int(os.environ.get("SOURCE_DATE_EPOCH", "0") or 0)
    if build_date <= 0 and info.get("built"):
        build_date = parse_build_date(info["built"])

    changelog = args.changelog
    changelog_file = args.changelog_file or args.notes
    if not changelog and changelog_file:
        try:
            changelog = Path(changelog_file).read_text(encoding="utf-8-sig", errors="replace")
        except OSError as exc:
            log(f"could not read changelog file: {exc}")

    if not changelog:
        run_url = os.environ.get("GITHUB_RUN_URL", "")
        if not run_url and os.environ.get("GITHUB_REPOSITORY") and os.environ.get("GITHUB_RUN_ID"):
            server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
            run_url = (
                f"{server}/{os.environ['GITHUB_REPOSITORY']}"
                f"/actions/runs/{os.environ['GITHUB_RUN_ID']}"
            )
        parts = []
        if version:
            parts.append(f"**{dist_name} {version}**")
        if device:
            parts.append(f"Device: `{device}`")
        if target:
            parts.append(f"Target: `{target}`")
        if info.get("built"):
            parts.append(f"Built: {info['built']}")
        if run_url:
            parts.append(f"[Workflow run]({run_url})")
        changelog = "\n\n".join(parts)

    changelog = sanitize_changelog(changelog)

    images = candidate_images(dist, target, device)

    if args.image:
        images = [Path(args.image)]
        if not images[0].exists():
            log(f"error: image {images[0]} does not exist")
            return 2

    if not images:
        log(f"error: no firmware image found in {dist}")
        return 2

    # x86 builds ship a legacy BIOS and an EFI image; both get their own key.
    # The plain keys always point at the legacy image, which is the safer
    # default for firmware that cannot detect the boot mode.
    variants: list[tuple[str, Path, bool]] = []
    if args.variant:
        variants = [(args.variant, images[0], True)]
    elif is_x86(target, device):
        bios, efi = pick_efi_pair(images)
        if bios is not None and efi is not None:
            variants = [("bios", bios, True), ("efi", efi, False)]
        elif bios is not None:
            variants = [("", bios, True)]
        elif efi is not None:
            variants = [("efi", efi, True)]
    else:
        variants = [("", images[0], True)]

    if not variants:
        variants = [("", images[0], True)]

    existing = load_existing(args.existing, args.existing_url)
    devices: dict[str, dict] = {}
    if isinstance(existing.get("devices"), dict):
        devices.update(existing["devices"])
    else:
        for key, value in existing.items():
            if isinstance(value, (dict, list)) and key not in ("schema", "generated", "dist"):
                devices[key] = value  # legacy flat layout

    primary_entry: dict | None = None
    written: list[str] = []
    records: list[dict] = []

    for variant, image, primary in variants:
        if not image.exists():
            continue
        name = image.name
        digest = checksums.get(name)
        if not digest:
            log(f"no checksum for {name}, hashing it")
            digest = sha256_of(image)
        size = image.stat().st_size

        url = ""
        if args.repo and args.tag:
            url = asset_url(args.repo, args.tag, name, args.url_base or None)
        elif args.url_base:
            url = asset_url(args.repo, args.tag, name, args.url_base)
        else:
            previous = devices.get(device) or {}
            if isinstance(previous, dict):
                url = str(previous.get("url", ""))

        if not url:
            log("error: cannot build an asset URL, pass --repo/--tag or --url-base")
            return 2

        entry = {
            "version": version,
            "build_date": build_date,
            "url": url,
            "sha256": digest,
            "size": size,
            "file": name,
            "target": target,
            "device": device,
            "changelog": changelog,
        }
        if variant:
            entry["variant"] = variant
        if label:
            entry["label"] = label

        keys = device_keys(device, target, args.board, variant, include_plain=primary,
                           aliases=(args.aliases == "all"))
        for key in keys:
            devices[key] = dict(entry)
            if key not in written:
                written.append(key)
        if primary_entry is None:
            primary_entry = dict(entry)
        records.append(dict(entry))

        log(f"{name}: {digest[:12]}... {size} bytes -> {', '.join(keys)}")

    if primary_entry is None:
        log("error: no entry was generated")
        return 2

    index = {
        "schema": 2,
        "generator": "luci-app-ota tools/gen_ota_index.py",
        "generated": int(time.time()),
        "dist": dist_name,
        "devices": dict(sorted(devices.items())),
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    log(f"index written to {out} ({len(devices)} device keys)")
    for key in written:
        log(f"  key: {key}")

    if args.history:
        update_history(Path(args.history), records, dist_name, args.max_history)

    return 0


if __name__ == "__main__":
    sys.exit(main())
