#!/bin/sh
set -eu
launchctl bootout system /Library/LaunchDaemons/com.cyberorbit.agent.plist
rm -f /Library/LaunchDaemons/com.cyberorbit.agent.plist
echo 'Daemon removed. Revoke server credential separately. Keychain/queue retained.'
