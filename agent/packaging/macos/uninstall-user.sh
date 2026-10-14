#!/bin/sh
set -eu
unset NODE_OPTIONS NODE_PATH
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -gt 0 ] || { echo 'Run as the enrolled employee, without sudo.' >&2; exit 1; }
user_home=$(/usr/bin/dscacheutil -q user -a uid "$(id -u)" | /usr/bin/sed -n 's/^dir: //p')
case "$user_home" in /*) ;; *) echo 'Current account home directory unavailable.' >&2; exit 1 ;; esac
exec "$user_home/Library/Application Support/CYBERORBIT/app/runtime/node" "$user_home/Library/Application Support/CYBERORBIT/app/src/macos-user-install.js" uninstall
