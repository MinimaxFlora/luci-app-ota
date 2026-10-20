#!/bin/sh
# SPDX-License-Identifier: MIT
#
# Publish the luci-app-ota update index to a dedicated branch of the firmware
# repository, so that the routers can fetch it from a stable URL such as
#
#   https://raw.githubusercontent.com/OWNER/REPO/ota/ota.json
#
# usage: publish_ota_index.sh --repo OWNER/REPO [options]
#
#   --repo OWNER/REPO   firmware repository (required)
#   --dist DIR          directory with the firmware artifacts   (default: dist)
#   --tag TAG           release tag the assets are attached to  (default: --device)
#   --device NAME       device profile name
#   --meta FILE         JSON metadata written by embed_ota_meta.py
#   --target BOARD/SUB  optional target override
#   --version VERSION   optional version override
#   --build-date EPOCH  optional build timestamp override
#   --dist-name NAME    distribution name stored in the index (default: ZeroWrt)
#   --changelog FILE    markdown changelog for this build
#   --url-base URL      override the asset URL prefix
#   --branch NAME       branch that stores ota.json          (default: ota)
#   --no-push           generate the index locally, do not push
#
# The token is taken from GH_TOKEN or GITHUB_TOKEN and needs contents:write.

set -eu

REPO=""
DIST="dist"
TAG=""
DEVICE=""
META=""
TARGET=""
VERSION=""
BUILD_DATE=""
DIST_NAME="ZeroWrt"
CHANGELOG=""
URL_BASE=""
BRANCH="ota"
PUSH=1

while [ $# -gt 0 ]; do
	case "$1" in
		--repo) REPO="${2:-}"; shift 2 ;;
		--dist) DIST="${2:-}"; shift 2 ;;
		--tag) TAG="${2:-}"; shift 2 ;;
		--device) DEVICE="${2:-}"; shift 2 ;;
		--meta) META="${2:-}"; shift 2 ;;
		--target) TARGET="${2:-}"; shift 2 ;;
		--version) VERSION="${2:-}"; shift 2 ;;
		--build-date) BUILD_DATE="${2:-}"; shift 2 ;;
		--dist-name) DIST_NAME="${2:-}"; shift 2 ;;
		--changelog) CHANGELOG="${2:-}"; shift 2 ;;
		--url-base) URL_BASE="${2:-}"; shift 2 ;;
		--branch) BRANCH="${2:-}"; shift 2 ;;
		--no-push) PUSH=0; shift ;;
		-h|--help) sed -n '2,32p' "$0"; exit 0 ;;
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

if [ ! -f "$GENERATOR" ]; then
	echo "error: $GENERATOR not found" >&2
	exit 2
fi

PYTHON=${PYTHON:-python3}

json_get() {
	"$PYTHON" -c 'import json,sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data = {}
value = data.get(sys.argv[2], "")
print("" if value is None else value)' "$1" "$2"
}

if [ -n "$META" ] && [ -f "$META" ]; then
	if [ -z "$DEVICE" ]; then DEVICE=$(json_get "$META" device); fi
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
	echo "error: GH_TOKEN or GITHUB_TOKEN is required to push the index" >&2
	exit 2
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

INDEX="$WORK/ota.json"

if [ "$PUSH" = "1" ]; then
	# Credentials are passed in the URL; stderr is suppressed so a failed
	# clone does not print the token into the build log.
	if git clone --quiet --depth 1 --branch "$BRANCH" \
			"https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORK/repo" 2>/dev/null; then
		echo "[ota] updating existing branch $BRANCH"
	else
		echo "[ota] creating branch $BRANCH"
		rm -rf "$WORK/repo"
		git init --quiet -b "$BRANCH" "$WORK/repo"
		git -C "$WORK/repo" remote add origin "https://x-access-token:${TOKEN}@github.com/${REPO}.git"
	fi
	INDEX="$WORK/repo/ota.json"
else
	# Local dry run: merge into ./ota.json so repeated runs behave like
	# consecutive builds of different devices.
	INDEX="./ota.json"
fi

set -- --dist "$DIST" --out "$INDEX" --repo "$REPO"
if [ -n "$TAG" ]; then set -- "$@" --tag "$TAG"; fi
if [ -n "$DEVICE" ]; then set -- "$@" --device "$DEVICE"; fi
if [ -n "$TARGET" ]; then set -- "$@" --target "$TARGET"; fi
if [ -n "$VERSION" ]; then set -- "$@" --version "$VERSION"; fi
if [ -n "$BUILD_DATE" ]; then set -- "$@" --build-date "$BUILD_DATE"; fi
if [ -n "$DIST_NAME" ]; then set -- "$@" --dist-name "$DIST_NAME"; fi
if [ -n "$URL_BASE" ]; then set -- "$@" --url-base "$URL_BASE"; fi
if [ -n "$CHANGELOG" ] && [ -f "$CHANGELOG" ]; then set -- "$@" --changelog-file "$CHANGELOG"; fi
if [ -f "$INDEX" ]; then set -- "$@" --existing "$INDEX"; fi

"$PYTHON" "$GENERATOR" "$@"

if [ "$PUSH" != "1" ]; then
	echo "[ota] --no-push given, index written to $INDEX"
	exit 0
fi

git -C "$WORK/repo" add ota.json

if git -C "$WORK/repo" diff --cached --quiet; then
	echo "[ota] index did not change, nothing to publish"
	exit 0
fi

git -C "$WORK/repo" \
	-c user.name="ota-bot" \
	-c user.email="ota-bot@users.noreply.github.com" \
	commit --quiet -m "OTA index: ${DEVICE} ${VERSION}"

git -C "$WORK/repo" push --quiet origin "$BRANCH"

echo "[ota] published to https://raw.githubusercontent.com/${REPO}/${BRANCH}/ota.json"
