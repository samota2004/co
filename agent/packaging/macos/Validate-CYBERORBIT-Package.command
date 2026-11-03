#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
echo "Employee package validated without installation (macOS $(/usr/bin/sw_vers -productVersion), $architecture)."
echo 'No service, LaunchAgent, credential, or file was installed or changed.'
