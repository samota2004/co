#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH
[ "$(uname -s)" = Darwin ] && [ "$(id -u)" -gt 0 ] || { echo 'Run as the employee on macOS, without sudo.' >&2; exit 1; }
package=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
"$package/runtime/node" "$package/src/macos-user-install.js" install
user_home=$("$package/runtime/node" -p 'require("node:os").userInfo().homedir')
"$user_home/Library/Application Support/CYBERORBIT/app/runtime/node" "$user_home/Library/Application Support/CYBERORBIT/app/src/macos-user-install.js" enroll
