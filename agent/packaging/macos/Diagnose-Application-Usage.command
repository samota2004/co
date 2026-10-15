#!/bin/sh
. "$(dirname -- "$0")/lib/employee-common.sh"
run_installed desktop-status
echo 'Use an application for at least 35 seconds, then rerun this command.'
echo 'Match lastAcceptedUsage.eventId to a new APPLICATION_USAGE record in the dashboard; heartbeat alone is not proof.'
