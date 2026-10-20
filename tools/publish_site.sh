#!/bin/sh
# SPDX-License-Identifier: MIT
#
# Publish the firmware page and its data to the gh-pages branch.
#
# The branch ends up with:
#
#   index.html            the download page (from site/)
#   assets/               css / js / logo
#   ota.json              the update index used by luci-app-ota
#   history.json          every release, used by the page changelog
#   favicon.svg .nojekyll
#
# usage: publish_site.sh --repo OWNER/REPO [options]
#
#   --repo OWNER/REPO   firmware repository (required)
#   --dist DIR          directory with the firmware artifacts   (default: dist)
#   --tag TAG           release tag the assets are attached to  (default: --device)
#   --device NAME       device profile name
#   --label NAME        human readable device name, e.g. "Ruijie RG-X60"
#   --meta FILE         JSON metadata written by embed_ota_meta.py
#   --target BOARD/SUB  optional target override
#   --version VERSION   optional version override
#   --build-date EPOCH  optional build timestamp override
#   --dist-name NAME    distribution name stored in the index  (default: ZeroWrt)
#   --changelog FILE    markdown changelog for this build
#   --url-base URL      override the asset URL prefix
#   --site DIR          page source                            (default: <repo>/site)
#   --branch NAME       branch that stores the page            (default: gh-pages)
#   --max-history N     releases kept in history.json          (default 120)
#   --no-push           build into ./_site for local preview, do not push
#
# The token is taken from GH_TOKEN or GITHUB_TOKEN and needs contents:write.

set -eu

REPO=""
DIST="dist"
TAG=""
DEVICE=""
LABEL=""
META=""
TARGET=""
VERSION=""
BUILD_DATE=""
DIST_NAME="ZeroWrt"
CHANGELOG=""
URL_BASE=""
SITE=""
BRANCH="gh-pages"
MAX_HISTORY=""
PUSH=1

while [ $# -gt 0 ]; do
	case "$1" in
		--repo) REPO="${2:-}"; shift 2 ;;
		--dist) DIST="${2:-}"; shift 2 ;;
		--tag) TAG="${2:-}"; shift 2 ;;
		--device) DEVICE="${2:-}"; shift 2 ;;
		--label) LABEL="${2:-}"; shift 2 ;;
		--meta) META="${2:-}"; shift 2 ;;
		--target) TARGET="${2:-}"; shift 2 ;;
		--version) VERSION="${2:-}"; shift 2 ;;
		--build-date) BUILD_DATE="${2:-}"; shift 2 ;;
		--dist-name) DIST_NAME="${2:-}"; shift 2 ;;
		--changelog) CHANGELOG="${2:-}"; shift 2 ;;
		--url-base) URL_BASE="${2:-}"; shift 2 ;;
		--site) SITE="${2:-}"; shift 2 ;;
		--branch) BRANCH="${2:-}"; shift 2 ;;
		--max-history) MAX_HISTORY="${2:-}"; shift 2 ;;
		--no-push) PUSH=0; shift ;;
		-h|--help) sed -n '2,38p' "$0"; exit 0 ;;
		*) echo "error: unknown option $1" >&2; exit 2 ;;
	esac
done

if [ -z "$REPO" ]; then
	echo "error: --repo OWNER/REPO is required" >&2
	exit 2
fi

if [ ! -d "$DIST" ]; then
	echo "error: artifact directory '$DIST' does not exist" >&2
	exit 2
fi

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
GENERATOR="$SCRIPT_DIR/gen_ota_index.py"

if [ -z "$SITE" ]; then
	SITE="$SCRIPT_DIR/../site"
fi

if [ ! -f "$SITE/index.html" ]; then
	echo "error: $SITE/index.html not found (use --site)" >&2
	exit 2
fi

if [ ! -f "$GENERATOR" ]; then
	echo "error: $GENERATOR not found" >&2
	exit 2
fi

PYTHON=${PYTHON:-python3}

json_get() {
	"$PYTHON" -c 'import json,sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8-sig"))
except Exception:
    data = {}
value = data.get(sys.argv[2], "")
print("" if value is None else value)' "$1" "$2"
}

if [ -n "$META" ] && [ -f "$META" ]; then
	if [ -z "$DEVICE" ]; then DEVICE=$(json_get "$META" device); fi
	if [ -z "$LABEL" ]; then LABEL=$(json_get "$META" product); fi
	if [ -z "$TARGET" ]; then TARGET=$(json_get "$META" target); fi
	if [ -z "$VERSION" ]; then VERSION=$(json_get "$META" version); fi
	if [ -z "$BUILD_DATE" ]; then BUILD_DATE=$(json_get "$META" build_date); fi
	if [ "$DIST_NAME" = "ZeroWrt" ]; then
		META_DIST=$(json_get "$META" dist)
		if [ -n "$META_DIST" ]; then DIST_NAME=$META_DIST; fi
	fi
fi

if [ -z "$DEVICE" ]; then
	echo "error: no device name given (--device or --meta)" >&2
	exit 2
fi

if [ -z "$TAG" ]; then
	TAG=$DEVICE
fi

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

if [ "$PUSH" = "1" ] && [ -z "$TOKEN" ]; then
	echo "error: GH_TOKEN or GITHUB_TOKEN is required to push the page" >&2
	exit 2
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ "$PUSH" = "1" ]; then
	# Credentials are passed in the URL; stderr is suppressed so a failed
	# clone does not print the token into the build log.
	if git clone --quiet --depth 1 --branch "$BRANCH" \
			"https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORK/repo" 2>/dev/null; then
		echo "[ota] updating existing $BRANCH branch"
	else
		echo "[ota] creating $BRANCH branch"
		rm -rf "$WORK/repo"
		git init --quiet -b "$BRANCH" "$WORK/repo"
		git -C "$WORK/repo" remote add origin "https://x-access-token:${TOKEN}@github.com/${REPO}.git"
	fi
	OUT="$WORK/repo"
else
	OUT="$PWD/_site"
	mkdir -p "$OUT"
	echo "[ota] --no-push, building into $OUT"
fi

# 1. the page itself
cp -R "$SITE/." "$OUT/"
: >"$OUT/.nojekyll"

# 2. ota.json (merged with what is already published) and history.json
set -- --dist "$DIST" --out "$OUT/ota.json" --repo "$REPO"
if [ -n "$TAG" ]; then set -- "$@" --tag "$TAG"; fi
if [ -n "$DEVICE" ]; then set -- "$@" --device "$DEVICE"; fi
if [ -n "$LABEL" ]; then set -- "$@" --label "$LABEL"; fi
if [ -n "$TARGET" ]; then set -- "$@" --target "$TARGET"; fi
if [ -n "$VERSION" ]; then set -- "$@" --version "$VERSION"; fi
if [ -n "$BUILD_DATE" ]; then set -- "$@" --build-date "$BUILD_DATE"; fi
if [ -n "$DIST_NAME" ]; then set -- "$@" --dist-name "$DIST_NAME"; fi
if [ -n "$URL_BASE" ]; then set -- "$@" --url-base "$URL_BASE"; fi
if [ -n "$CHANGELOG" ] && [ -f "$CHANGELOG" ]; then set -- "$@" --changelog-file "$CHANGELOG"; fi
if [ -n "$MAX_HISTORY" ]; then set -- "$@" --max-history "$MAX_HISTORY"; fi
if [ -f "$OUT/ota.json" ]; then set -- "$@" --existing "$OUT/ota.json"; fi
set -- "$@" --history "$OUT/history.json"

"$PYTHON" "$GENERATOR" "$@"

if [ "$PUSH" != "1" ]; then
	echo "[ota] page built in $OUT"
	echo "[ota] preview with: $PYTHON -m http.server -d $OUT 8000"
	exit 0
fi

git -C "$OUT" add -A

if git -C "$OUT" diff --cached --quiet; then
	echo "[ota] page did not change, nothing to publish"
	exit 0
fi

git -C "$OUT" \
	-c user.name="ota-bot" \
	-c user.email="ota-bot@users.noreply.github.com" \
	commit --quiet -m "Firmware page: ${DEVICE} ${VERSION} [skip ci]"

git -C "$OUT" push --quiet origin "$BRANCH"

OWNER=$(printf '%s' "${REPO%%/*}" | tr 'A-Z' 'a-z')
NAME=$(printf '%s' "${REPO#*/}")
echo "[ota] published to https://${OWNER}.github.io/${NAME}/"
