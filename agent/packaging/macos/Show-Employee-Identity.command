#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
"$payload/runtime/node" "$payload/src/macos-user-install.js" identity
echo 'Give the identity (uid:number) and hostname above to your administrator before device assignment.'
