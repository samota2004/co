#!/bin/sh
set -eu
# Install only a reviewed root-owned package. Re-running preserves enrollment.
[ "$(id -u)" = 0 ] || { echo 'root required' >&2; exit 1; }
[ -x /opt/cyberorbit/runtime/node ] || { echo 'Install runtime-inclusive package under /opt/cyberorbit' >&2; exit 1; }
test -f /etc/cyberorbit/config.json
for tool in systemctl loginctl systemd-creds setpriv python3; do command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }; done
/usr/bin/python3 -c 'from gi.repository import Gio, GLib' || { echo 'Install Python GObject/Gio for the desktop helper' >&2; exit 1; }
policy=$(/opt/cyberorbit/runtime/node /opt/cyberorbit/src/unix-install-check.js /etc/cyberorbit/config.json)
install -m 644 /opt/cyberorbit/packaging/linux/cyberorbit.service /etc/systemd/system/cyberorbit.service
if [ "$policy" = account-control ]; then
  install -d -m 755 /etc/systemd/system/cyberorbit.service.d
  # usermod atomically replaces shadow/passwd and creates locks in /etc.
  # Only locally approved account-control installations get this write access.
  printf '[Service]\nReadWritePaths=/etc\n' > /etc/systemd/system/cyberorbit.service.d/account-control.conf
fi
install -d -m 755 /usr/share/gnome-shell/extensions/desktop@cyberorbit.local
install -m 644 /opt/cyberorbit/packaging/linux/gnome-extension/metadata.json /usr/share/gnome-shell/extensions/desktop@cyberorbit.local/metadata.json
install -m 644 /opt/cyberorbit/packaging/linux/gnome-extension/extension.js /usr/share/gnome-shell/extensions/desktop@cyberorbit.local/extension.js
systemctl daemon-reload
systemctl enable cyberorbit.service
systemctl restart cyberorbit.service
echo 'Service installed. GNOME users must enable desktop@cyberorbit.local after logging out/in. See README for X11/KDE prerequisites and native acceptance checks.'
