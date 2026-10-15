#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
"$payload/runtime/node" "$payload/packaging/macos/update-user.js"
