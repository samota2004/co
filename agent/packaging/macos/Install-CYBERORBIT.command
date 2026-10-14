#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
printf 'CYBERORBIT macOS employee installation (%s)\n' "$architecture"
if [ -e "$employee_home/Library/Application Support/CYBERORBIT" ]; then
  echo 'Existing installation found. Preserving credentials and offline events.'
  run_installed continue
else
  "$payload/runtime/node" "$payload/src/macos-user-install.js" install
  run_installed enroll
fi
echo 'Installation and authenticated heartbeat verified. You may close Terminal.'
