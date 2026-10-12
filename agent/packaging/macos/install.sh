#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
test -x /Library/CYBERORBIT/runtime/node
test -f /Library/CYBERORBIT/config.json
test -x /Library/CYBERORBIT/native/keychain
test -x /Library/CYBERORBIT/native/macos-desktop
/Library/CYBERORBIT/runtime/node /Library/CYBERORBIT/src/unix-install-check.js /Library/CYBERORBIT/config.json
desktop_uid=$(/Library/CYBERORBIT/runtime/node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync("/Library/CYBERORBIT/config.json","utf8")).desktopIdentity.slice(4))')
launchctl bootout "gui/$desktop_uid/com.cyberorbit.desktop" >/dev/null 2>&1 || true
if launchctl print system/com.cyberorbit.agent >/dev/null 2>&1; then
  launchctl bootout system /Library/LaunchDaemons/com.cyberorbit.agent.plist
fi
install -m 644 /Library/CYBERORBIT/packaging/macos/com.cyberorbit.agent.plist /Library/LaunchDaemons/com.cyberorbit.agent.plist
launchctl enable system/com.cyberorbit.agent
launchctl bootstrap system /Library/LaunchDaemons/com.cyberorbit.agent.plist
echo 'LaunchDaemon installed; mapped user helper is supervised at GUI login. Approve Accessibility for the desktop helper to collect browser titles. See README for acceptance checks.'
