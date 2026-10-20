#!/usr/bin/env python3
"""Regenerate the gettext template and the Simplified Chinese catalogue.

Every translatable string is extracted from the LuCI sources:

  * ``_('...')`` calls in ``htdocs/luci-static/resources/view/**.js``
  * ``"title"`` values in ``root/usr/share/luci/menu.d/*.json``
  * ``"description"`` values in ``root/usr/share/rpcd/acl.d/*.json``

Each message keeps a ``#: file:line`` reference like the LuCI application
packages do, the entries are sorted by msgid and long strings are wrapped the
same way xgettext wraps them. Existing translations are preserved, so running
the tool after adding a string only adds the new entry.

Usage:
    tools/gen_po.py            # rewrite po/templates/ota.pot and po/zh_Hans/ota.po
    tools/gen_po.py --check    # fail when the files are out of date
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

DOMAIN = "ota"
LANGUAGES = {"zh_Hans": "Chinese"}
WRAP = 72

PY_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\"}


def unescape_js(text: str) -> str:
    out = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\" and i + 1 < len(text):
            out.append(PY_ESCAPES.get(text[i + 1], text[i + 1]))
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def quote(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def wrap(text: str, limit: int = WRAP) -> list[str]:
    """Split into chunks of at most ``limit`` characters, keeping spaces."""
    chunks: list[str] = []
    current = ""
    for piece in re.split(r"(?<=\s)", text):
        if current and len(current) + len(piece) > limit:
            chunks.append(current)
            current = piece
        else:
            current += piece
    if current or not chunks:
        chunks.append(current)
    return chunks


def emit(prefix: str, text: str) -> list[str]:
    parts = wrap(quote(text))
    if len(parts) == 1:
        return [f'{prefix}"{parts[0]}"']
    return [f'{prefix}""'] + [f'"{part}"' for part in parts]


def collect_sources(root: Path) -> dict[str, list[str]]:
    """msgid -> ["path:line", ...]"""
    refs: dict[str, list[str]] = {}

    def add(msgid: str, ref: str) -> None:
        if not msgid:
            return
        refs.setdefault(msgid, []).append(ref)

    pattern = re.compile(r"_\(\s*'((?:[^'\\]|\\.)*)'")
    for path in sorted((root / "htdocs").rglob("*.js")):
        relative = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8")
        for match in pattern.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            add(unescape_js(match.group(1)), f"{relative}:{line}")

    for path in sorted((root / "root" / "usr" / "share" / "luci" / "menu.d").glob("*.json")):
        relative = path.relative_to(root).as_posix()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = re.search(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
            if match:
                add(unescape_js(match.group(1)), f"{relative}:{lineno}")

    for path in sorted((root / "root" / "usr" / "share" / "rpcd" / "acl.d").glob("*.json")):
        relative = path.relative_to(root).as_posix()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
            if match:
                add(unescape_js(match.group(1)), f"{relative}:{lineno}")

    return {msgid: sorted(set(locations)) for msgid, locations in refs.items()}


def parse_po(path: Path) -> dict[str, str]:
    """Read an existing catalogue into a msgid -> msgstr mapping."""
    translations: dict[str, str] = {}
    if not path.exists():
        return translations

    msgid = None
    msgstr = None
    mode = None

    def flush() -> None:
        nonlocal msgid, msgstr
        if msgid:
            translations[msgid] = msgstr or ""
        msgid = msgstr = None

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            flush()
            mode = None
            continue
        if line.startswith("#"):
            continue
        if line.startswith("msgid "):
            if msgid is not None and msgstr is not None:
                flush()
            mode = "id"
            msgid = decode(line[6:])
        elif line.startswith("msgstr "):
            mode = "str"
            msgstr = decode(line[7:])
        elif line.startswith('"') and mode:
            value = decode(line)
            if mode == "id":
                msgid = (msgid or "") + value
            else:
                msgstr = (msgstr or "") + value
    flush()
    return translations


def decode(quoted: str) -> str:
    text = quoted.strip()
    if not (text.startswith('"') and text.endswith('"')):
        raise SystemExit(f"malformed entry: {quoted!r}")
    return unescape_js(text[1:-1])


def header(dates: str, *, pot: bool) -> list[str]:
    lines = ['msgid ""', 'msgstr ""']
    fields = [
        f"Project-Id-Version: luci-app-{DOMAIN}",
        "Report-Msgid-Bugs-To: ",
    ]
    if pot:
        fields.append(f"POT-Creation-Date: {dates}")
    else:
        fields += [
            f"PO-Revision-Date: {dates}",
            "Last-Translator: MinimaxFlora <MinimaxFlora@users.noreply.github.com>",
            "Language-Team: Chinese",
            "Language: zh_Hans",
        ]
    fields += [
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
    ]
    lines += [f'"{quote(field)}\\n"' for field in fields]
    return lines


def render(refs: dict[str, list[str]], translations: dict[str, str], dates: str, *,
           pot: bool) -> str:
    lines = header(dates, pot=pot)
    for msgid in sorted(refs):
        lines.append("")
        for location in refs[msgid]:
            lines.append(f"#: {location}")
        lines += emit("msgid ", msgid)
        lines += emit("msgstr ", "" if pot else translations.get(msgid, ""))
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    root_default = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Regenerate the ota gettext files")
    parser.add_argument("--root", default=str(root_default), help="package root")
    parser.add_argument("--date", default="", help="override the header date")
    parser.add_argument("--check", action="store_true",
                        help="do not write, exit 1 when the files are out of date")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    refs = collect_sources(root)
    if not refs:
        raise SystemExit("no translatable strings found")

    dates = args.date or datetime.now().astimezone().strftime("%Y-%m-%d %H:%M%z")
    pot_path = root / "po" / "templates" / f"{DOMAIN}.pot"
    pot_text = render(refs, {}, dates, pot=True)

    changed = []

    if args.check:
        # Compare the message sets rather than the whole file: the "#:" line
        # numbers drift with every source edit and are refreshed by running
        # this tool, but a missing or stale message is a real problem.
        existing = parse_po(pot_path) if pot_path.exists() else {}
        missing = sorted(set(refs) - set(existing))
        stale = sorted(set(existing) - set(refs))
        if missing or stale:
            if missing:
                print("missing from the template:", file=sys.stderr)
                for msgid in missing:
                    print(f"  + {msgid}", file=sys.stderr)
            if stale:
                print("no longer used by the sources:", file=sys.stderr)
                for msgid in stale:
                    print(f"  - {msgid}", file=sys.stderr)
            print(f"run tools/gen_po.py to refresh {pot_path.relative_to(root)}", file=sys.stderr)
            return 1
        for language in LANGUAGES:
            po_path = root / "po" / language / f"{DOMAIN}.po"
            translations = parse_po(po_path)
            untranslated = sorted(msgid for msgid in refs if not translations.get(msgid))
            if untranslated:
                print(f"untranslated entries in {po_path.relative_to(root)}:", file=sys.stderr)
                for msgid in untranslated:
                    print(f"  - {msgid}", file=sys.stderr)
                return 1
        print(f"{len(refs)} messages, catalogue is up to date")
        return 0

    pot_path.parent.mkdir(parents=True, exist_ok=True)
    if not pot_path.exists() or pot_path.read_text(encoding="utf-8") != pot_text:
        pot_path.write_text(pot_text, encoding="utf-8", newline="\n")
        changed.append(pot_path)

    for language in LANGUAGES:
        po_path = root / "po" / language / f"{DOMAIN}.po"
        translations = parse_po(po_path)
        po_text = render(refs, translations, dates, pot=False)
        po_path.parent.mkdir(parents=True, exist_ok=True)
        if not po_path.exists() or po_path.read_text(encoding="utf-8") != po_text:
            po_path.write_text(po_text, encoding="utf-8", newline="\n")
            changed.append(po_path)

    untranslated = sorted(set(refs) - set(parse_po(root / "po" / "zh_Hans" / f"{DOMAIN}.po")))
    print(f"{len(refs)} messages, {len(untranslated)} untranslated")
    for path in changed:
        print(f"updated {path.relative_to(root)}")
    if not changed:
        print("nothing to do")
    return 0



if __name__ == "__main__":
    sys.exit(main())
