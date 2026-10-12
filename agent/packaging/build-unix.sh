#!/bin/sh
set -eu
# Execute on the target OS/architecture; includes that machine's Node >=22 runtime.
agent_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$platform" in linux|darwin) ;; *) echo 'Build on the target Linux/macOS architecture' >&2; exit 1 ;; esac
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
out="$agent_root/dist/$platform"
if [ -e "$out" ]; then echo "Output already exists: $out. Review/archive it before building a fresh package." >&2; exit 1; fi
mkdir -p "$out/runtime"
cp -R "$agent_root/src" "$agent_root/shared" "$agent_root/native" "$agent_root/packaging" "$out/"
cp "$agent_root/package.json" "$out/"
cp "$agent_root/README.md" "$out/"
cp "$agent_root/UNIX.md" "$out/"
cp "$agent_root/CHANGES.md" "$agent_root/VERIFICATION.md" "$out/"
cp "$(command -v node)" "$out/runtime/node"
if [ "$platform" = darwin ]; then
  swiftc "$out/native/keychain.swift" -o "$out/native/keychain"
  swiftc "$out/native/macos-desktop.swift" -o "$out/native/macos-desktop"
  # A stable Developer ID is recommended for distribution/TCC continuity.
  if [ -n "${CYBERORBIT_SIGNING_IDENTITY:-}" ]; then
    codesign --force --options runtime --sign "$CYBERORBIT_SIGNING_IDENTITY" "$out/native/keychain"
    codesign --force --options runtime --sign "$CYBERORBIT_SIGNING_IDENTITY" "$out/native/macos-desktop"
  fi
elif [ "${CYBERORBIT_KDE:-0}" = 1 ]; then
  cmake -S "$agent_root/native/linux-idle" -B "$out/idle-build"
  cmake --build "$out/idle-build"
  cp "$out/idle-build/linux-idle-helper" "$out/native/linux-idle-helper"
fi
chmod 755 "$out/runtime/node"
tar -czf "$agent_root/dist/CYBERORBIT-$platform.tar.gz" -C "$out" .
