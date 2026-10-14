#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH
finish() {
  result=$?
  printf '\nPress Return to close this build window.\n'
  read -r ignored || true
  exit "$result"
}
trap finish 0
[ "$(/usr/bin/uname -s)" = Darwin ] || { echo 'Build this kit on a Mac with Apple Command Line Tools.' >&2; exit 1; }
[ "$(/usr/bin/id -u)" -gt 0 ] || { echo 'Use a logged-in build account, without sudo.' >&2; exit 1; }
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
/usr/bin/xcrun --find swiftc >/dev/null
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then architecture=arm64; else architecture=x64; fi
archive=$(/usr/bin/find "$root/runtime-archives" -maxdepth 1 -type f -name "node-*-darwin-$architecture.tar.gz")
[ -n "$archive" ] || { echo 'The verified Node archive for this build Mac is missing.' >&2; exit 1; }
bootstrap="$root/.build-node"
[ ! -e "$bootstrap" ] || { echo 'Existing .build-node directory found. Preserve/review it before another build.' >&2; exit 1; }
mkdir -m 700 "$bootstrap"
(cd "$root/runtime-archives" && /usr/bin/shasum -a 256 -c SHA256SUMS)
/usr/bin/tar -xzf "$archive" -C "$bootstrap" --strip-components=1
"$bootstrap/bin/node" "$root/agent/packaging/macos/build-install-kit.js" --runtime-archives "$root/runtime-archives" --output "$root/output"
printf '\nEmployee ZIP: %s/output/CYBERORBIT-macOS-Install-Kit.zip\n' "$root"
echo 'Validate this kit on Apple Silicon and Intel Macs before the employee rollout; browser-title testing remains pending.'
