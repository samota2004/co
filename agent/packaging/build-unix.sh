#!/bin/sh
set -eu
# Execute on the target OS/architecture; includes that machine's Node >=22 runtime.
agent_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
platform=$(uname -s | tr '[:upper:]' '[:lower:]')
out="$agent_root/dist/$platform"
mkdir -p "$out/runtime"
cp -R "$agent_root/src" "$agent_root/shared" "$agent_root/native" "$agent_root/packaging" "$out/"
cp "$agent_root/package.json" "$out/"
cp "$agent_root/README.md" "$out/"
cp "$agent_root/CHANGES.md" "$agent_root/VERIFICATION.md" "$out/"
cp "$(command -v node)" "$out/runtime/node"
if [ "$platform" = darwin ]; then
  swiftc "$out/native/keychain.swift" -o "$out/native/keychain"
  swiftc "$out/native/macos-desktop.swift" -o "$out/native/macos-desktop"
fi
tar -czf "$agent_root/dist/CYBERORBIT-$platform.tar.gz" -C "$out" .
