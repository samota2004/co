#!/bin/sh
set -eu
systemctl disable --now cyberorbit.service
rm -f /etc/systemd/system/cyberorbit.service
systemctl daemon-reload
echo 'Service removed. Revoke server credential separately. Package/queue retained.'
