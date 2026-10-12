#!/bin/sh
set -eu
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
[ ! -f /var/lib/cyberorbit/unix-account-control.json ] || { echo 'Restore/review the controlled account before uninstalling; recovery journal exists.' >&2; exit 1; }
systemctl disable --now cyberorbit.service
rm -f /etc/systemd/system/cyberorbit.service
rm -f /etc/systemd/system/cyberorbit.service.d/account-control.conf
systemctl daemon-reload
echo 'Service removed. Revoke server credential separately. Package/queue retained.'
