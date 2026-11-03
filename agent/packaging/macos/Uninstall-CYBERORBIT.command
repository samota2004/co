#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
"$payload/runtime/node" "$payload/src/macos-user-install.js" uninstall
