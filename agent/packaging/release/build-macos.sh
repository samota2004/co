#!/bin/sh
set -eu
agent_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
dist="$agent_root/dist"
archive_dir=${CYBERORBIT_MACOS_RUNTIME_ARCHIVES:-}
output="$dist/CYBERORBIT-macOS-Employee.zip"
if [ "$(uname -s)" != Darwin ]; then echo 'Build this package on a supported macOS host; Windows helpers require native compilation.' >&2; exit 2; fi
if [ -z "$archive_dir" ]; then echo 'Set CYBERORBIT_MACOS_RUNTIME_ARCHIVES to the directory containing the verified pinned runtimes.' >&2; exit 2; fi
if [ -L "$output" ] || { [ -e "$output" ] && [ ! -f "$output" ]; }; then echo "Existing output is not a regular package file: $output" >&2; exit 2; fi
if [ -e "$output" ]; then echo "Employee release already exists; verify and preserve it before choosing a new release path: $output" >&2; exit 2; fi
if [ -e "$output.sha256" ]; then echo "Existing checksum must be preserved and reviewed before choosing a new release path: $output.sha256" >&2; exit 2; fi
# Keep the validated candidate outside dist, on the same volume, so rename can
# atomically replace the one approved output only after all checks pass.
tmp=$(mktemp -d "$agent_root/.macos-release.XXXXXX")
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT HUP INT TERM
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
  arch=arm64
else
  case "$(uname -m)" in x86_64) arch=x64 ;; *) echo 'Unsupported build CPU; use Apple Silicon or Intel x86_64.' >&2; exit 2 ;; esac
fi
spec="$agent_root/packaging/macos/node-runtime.json"
runtime_version=$(node -p "JSON.parse(require('fs').readFileSync('$spec','utf8')).version")
runtime_archive="node-${runtime_version}-darwin-${arch}.tar.gz"
runtime_path="$archive_dir/$runtime_archive"
test -s "$runtime_path" || { echo "Pinned Mac runtime archive missing: $runtime_path" >&2; exit 2; }
expected=$(node -p "JSON.parse(require('fs').readFileSync('$spec','utf8')).archives['$arch'].sha256")
actual=$(shasum -a 256 "$runtime_path" | awk '{print $1}')
[ "$actual" = "$expected" ] || { echo 'Pinned host runtime SHA-256 mismatch.' >&2; exit 2; }
mkdir -m 700 "$tmp/bootstrap"
tar -xzf "$runtime_path" -C "$tmp/bootstrap" --strip-components=1
"$tmp/bootstrap/bin/node" "$agent_root/packaging/macos/build-install-kit.js" --runtime-archives "$archive_dir" --output "$tmp/build"
candidate="$tmp/build/CYBERORBIT-macOS-Employee.zip"
candidate_checksum="$candidate.sha256"
test -s "$candidate"
test -s "$candidate_checksum"
CYBERORBIT_RELEASE_MACOS_ARCHIVE="$candidate" node --test "$agent_root/test/release-package.test.js"
mkdir -p "$dist"
mv "$candidate_checksum" "$output.sha256"
mv "$candidate" "$output"
printf 'platform=macOS\npackage=%s\nversion=%s\n' "$output" "$("$tmp/bootstrap/bin/node" -p "require('$agent_root/package.json').version")"
shasum -a 256 "$output"
