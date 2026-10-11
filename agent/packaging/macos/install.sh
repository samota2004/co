#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
test -x /Library/CYBERORBIT/runtime/node
test -f /Library/CYBERORBIT/config.json
test ! -f /Library/LaunchDaemons/com.cyberorbit.agent.plist
swiftc /Library/CYBERORBIT/native/keychain.swift -o /Library/CYBERORBIT/native/keychain
swiftc /Library/CYBERORBIT/native/macos-desktop.swift -o /Library/CYBERORBIT/native/macos-desktop
install -m 644 /Library/CYBERORBIT/packaging/macos/com.cyberorbit.agent.plist /Library/LaunchDaemons/com.cyberorbit.agent.plist
launchctl bootstrap system /Library/LaunchDaemons/com.cyberorbit.agent.plist
