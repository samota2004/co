#!/bin/sh
set -eu
agent_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
dist="$agent_root/dist"
archive_dir=${CYBERORBIT_MACOS_RUNTIME_ARCHIVES:-"$agent_root/dist/macos-runtime-cache"}
output="$dist/CYBERORBIT-macOS.zip"
if [ "$(uname -s)" != Darwin ]; then echo 'Build this package on a supported macOS host; Windows helpers require native compilation.' >&2; exit 2; fi
if [ -e "$output" ]; then echo "Refusing to overwrite existing package: $output" >&2; exit 2; fi
tmp=$(mktemp -d "${TMPDIR:-/tmp}/cyberorbit-macos-release.XXXXXX")
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT HUP INT TERM
node "$agent_root/packaging/macos/build-install-kit.js" --runtime-archives "$archive_dir" --output "$tmp/build"
candidate="$tmp/build/CYBERORBIT-macOS-Install-Kit.zip"
test -s "$candidate"
CYBERORBIT_RELEASE_MACOS_ARCHIVE="$candidate" node --test "$agent_root/test/release-package.test.js"
mkdir -p "$dist"
mv "$candidate" "$output"
printf 'platform=macOS\npackage=%s\nversion=%s\n' "$output" "$(node -p "require('$agent_root/package.json').version")"
shasum -a 256 "$output"
