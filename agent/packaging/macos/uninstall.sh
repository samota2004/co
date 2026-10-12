#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
[ ! -f '/Library/Application Support/CYBERORBIT/unix-account-control.json' ] || { echo 'Restore/review the controlled account before uninstalling; recovery journal exists.' >&2; exit 1; }
desktop_uid=$(/Library/CYBERORBIT/runtime/node --input-type=module -e 'import fs from "node:fs"; const id=JSON.parse(fs.readFileSync("/Library/CYBERORBIT/config.json","utf8")).desktopIdentity; if(!/^uid:[1-9][0-9]*$/.test(id))process.exit(1); console.log(id.slice(4))')
launchctl bootout system /Library/LaunchDaemons/com.cyberorbit.agent.plist
launchctl bootout "gui/$desktop_uid/com.cyberorbit.desktop" >/dev/null 2>&1 || true
rm -f /Library/LaunchDaemons/com.cyberorbit.agent.plist
echo 'Daemon removed. Revoke server credential separately. Keychain/queue retained.'
