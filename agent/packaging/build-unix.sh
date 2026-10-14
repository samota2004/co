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
cp -R "$agent_root/browser-companion" "$out/"
cp "$agent_root/browser-companion/background.js" "$out/browser-companion/chromium/background.js"
cp "$agent_root/browser-companion/background.js" "$out/browser-companion/firefox/background.js"
cp "$agent_root/package.json" "$out/"
cp "$agent_root/README.md" "$out/"
cp "$agent_root/UNIX.md" "$out/"
cp "$agent_root/CHANGES.md" "$agent_root/VERIFICATION.md" "$out/"
if [ "$platform" = darwin ]; then cp "$agent_root/packaging/macos/USER-INSTALL.md" "$out/USER-INSTALL.md"; fi
cp "$(command -v node)" "$out/runtime/node"
if [ "$platform" = darwin ]; then
  architecture=$("$out/runtime/node" -p 'process.arch')
  case "$architecture" in arm64) swift_arch=arm64 ;; x64) swift_arch=x86_64 ;; *) echo 'Unsupported macOS runtime architecture' >&2; exit 1 ;; esac
  swiftc -target "$swift_arch-apple-macosx13.0" "$out/native/keychain.swift" -o "$out/native/keychain"
  swiftc -target "$swift_arch-apple-macosx13.0" "$out/native/macos-desktop.swift" -o "$out/native/macos-desktop"
  swiftc -target "$swift_arch-apple-macosx13.0" "$out/native/macos-lock.swift" -o "$out/native/macos-lock"
  # Explicit native validation also exercises temporary Keychain entries.
  node --test "$agent_root/test/macos-user.test.js" "$agent_root/test/macos-runtime.test.js"
  # A stable Developer ID is recommended for distribution/TCC continuity.
  if [ -n "${CYBERORBIT_SIGNING_IDENTITY:-}" ]; then
    codesign --force --options runtime --sign "$CYBERORBIT_SIGNING_IDENTITY" "$out/native/keychain"
    codesign --force --options runtime --sign "$CYBERORBIT_SIGNING_IDENTITY" "$out/native/macos-desktop"
    codesign --force --options runtime --sign "$CYBERORBIT_SIGNING_IDENTITY" "$out/native/macos-lock"
  fi
elif [ "${CYBERORBIT_KDE:-0}" = 1 ]; then
  cmake -S "$agent_root/native/linux-idle" -B "$out/idle-build"
  cmake --build "$out/idle-build"
  cp "$out/idle-build/linux-idle-helper" "$out/native/linux-idle-helper"
fi
chmod 755 "$out/runtime/node"
"$out/runtime/node" --input-type=module -e 'import fs from "node:fs"; const root=process.argv[1]; const p=JSON.parse(fs.readFileSync(root+"/package.json")); fs.writeFileSync(root+"/build-manifest.json",JSON.stringify({agentVersion:p.version,nodeVersion:process.version,platform:process.platform,arch:process.arch,minimumMacOS:process.platform==="darwin"?"13.0":null,builtAt:new Date().toISOString()},null,2));' "$out"
tar -czf "$agent_root/dist/CYBERORBIT-$platform.tar.gz" -C "$out" .
if [ "$platform" = darwin ]; then
  architecture=$("$out/runtime/node" -p 'process.arch')
  cp "$agent_root/dist/CYBERORBIT-$platform.tar.gz" "$agent_root/dist/CYBERORBIT-macos-$architecture.tar.gz"
  shasum -a 256 "$agent_root/dist/CYBERORBIT-macos-$architecture.tar.gz" > "$agent_root/dist/CYBERORBIT-macos-$architecture.tar.gz.sha256"
fi
