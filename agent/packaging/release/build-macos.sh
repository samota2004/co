#!/bin/sh
set -eu
agent_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
dist="$agent_root/dist"
archive_dir=${CYBERORBIT_MACOS_RUNTIME_ARCHIVES:-}
output="$dist/CYBERORBIT-macOS.zip"
if [ "$(uname -s)" != Darwin ]; then echo 'Build this package on a supported macOS host; Windows helpers require native compilation.' >&2; exit 2; fi
if [ -z "$archive_dir" ]; then echo 'Set CYBERORBIT_MACOS_RUNTIME_ARCHIVES to the directory containing the verified pinned runtimes.' >&2; exit 2; fi
if [ -L "$output" ] || { [ -e "$output" ] && [ ! -f "$output" ]; }; then echo "Existing output is not a regular package file: $output" >&2; exit 2; fi
# Keep the validated candidate outside dist, on the same volume, so rename can
# atomically replace the one approved output only after all checks pass.
tmp=$(mktemp -d "$agent_root/.macos-release.XXXXXX")
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT HUP INT TERM
node "$agent_root/packaging/macos/build-install-kit.js" --runtime-archives "$archive_dir" --output "$tmp/build"
candidate="$tmp/build/CYBERORBIT-macOS-Install-Kit.zip"
test -s "$candidate"
CYBERORBIT_RELEASE_MACOS_ARCHIVE="$candidate" node --test "$agent_root/test/release-package.test.js"
mkdir -p "$dist"
mv -f "$candidate" "$output"
printf 'platform=macOS\npackage=%s\nversion=%s\n' "$output" "$(node -p "require('$agent_root/package.json').version")"
shasum -a 256 "$output"
