#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
run_installed titles-on
run_installed permissions
echo 'Dashboard approval and a registered browser companion are also required. See README.txt.'
