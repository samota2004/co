#!/bin/sh
set -eu
# Provide a runtime-inclusive Linux package and Secret Service for the service identity first.
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
[ -x /opt/cyberorbit/runtime/node ] || { echo 'Install runtime-inclusive package under /opt/cyberorbit' >&2; exit 1; }
test -f /etc/cyberorbit/config.json
test ! -f /etc/systemd/system/cyberorbit.service
install -m 644 /opt/cyberorbit/packaging/linux/cyberorbit.service /etc/systemd/system/cyberorbit.service
systemctl daemon-reload
systemctl enable --now cyberorbit.service
