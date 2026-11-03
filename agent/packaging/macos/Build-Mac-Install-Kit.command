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
/usr/bin/xcrun --sdk macosx --show-sdk-path >/dev/null || { echo 'The macOS SDK is missing. Install Xcode Command Line Tools with xcode-select --install.' >&2; exit 1; }
/usr/bin/xcrun --find swiftc >/dev/null
/usr/bin/xcrun --find lipo >/dev/null
for tool in /usr/bin/tar /usr/bin/shasum /usr/bin/find /usr/bin/lipo /usr/bin/sw_vers /usr/sbin/sysctl /usr/bin/head; do
  [ -x "$tool" ] || { echo "Required macOS build tool is missing: $tool" >&2; exit 1; }
done
swift_version=$(/usr/bin/xcrun swiftc --version | /usr/bin/head -n 1)
printf 'Swift toolchain: %s\n' "$swift_version"
macos_major=$(/usr/bin/sw_vers -productVersion | /usr/bin/cut -d . -f 1)
[ "$macos_major" -ge 13 ] || { echo 'The build host must run macOS 13 or later.' >&2; exit 1; }
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
  architecture=arm64
else
  case "$(/usr/bin/uname -m)" in x86_64) architecture=x64 ;; *) echo 'Unsupported build CPU architecture; use Apple Silicon or Intel x86_64.' >&2; exit 1 ;; esac
fi
archive=$(/usr/bin/find "$root/runtime-archives" -maxdepth 1 -type f -name "node-*-darwin-$architecture.tar.gz")
[ -n "$archive" ] || { echo 'The verified Node archive for this build Mac is missing.' >&2; exit 1; }
bootstrap="$root/.build-node"
[ ! -e "$bootstrap" ] || { echo 'Existing .build-node directory found. Preserve/review it before another build.' >&2; exit 1; }
mkdir -m 700 "$bootstrap"
(cd "$root/runtime-archives" && /usr/bin/shasum -a 256 -c SHA256SUMS)
/usr/bin/tar -xzf "$archive" -C "$bootstrap" --strip-components=1
"$bootstrap/bin/node" "$root/agent/packaging/macos/build-install-kit.js" --runtime-archives "$root/runtime-archives" --output "$root/output"
printf '\nEmployee ZIP: %s/output/CYBERORBIT-macOS-Employee.zip\n' "$root"
printf 'SHA-256: %s/output/CYBERORBIT-macOS-Employee.zip.sha256\n' "$root"
echo 'Validate this kit on Apple Silicon and Intel Macs before the employee rollout; browser-title testing remains pending.'
