#!/bin/sh
# Sourced by the double-click employee commands. Never enable shell tracing.
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH
finish() {
  result=$?
  if [ "$result" -ne 0 ]; then printf '\nCYBERORBIT could not finish. Preserve your enrollment and review the message above.\n'; fi
  printf '\nPress Return to close this command; the agent runs independently of Terminal.\n'
  read -r ignored || true
  exit "$result"
}
trap finish 0
[ "$(/usr/bin/uname -s)" = Darwin ] || { echo 'This install kit is for macOS.' >&2; exit 1; }
[ "$(/usr/bin/id -u)" -gt 0 ] || { echo 'Open this command in your own employee account, without sudo.' >&2; exit 1; }
kit=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
major=$(/usr/bin/sw_vers -productVersion | /usr/bin/cut -d . -f 1)
[ "$major" -ge 13 ] || { echo 'This kit requires macOS 13 or later.' >&2; exit 1; }
if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
  architecture=arm64
else
  case "$(/usr/bin/uname -m)" in x86_64) architecture=x64 ;; *) echo 'Unsupported Mac CPU architecture.' >&2; exit 1 ;; esac
fi
payload="$kit/payloads/$architecture"
[ -x "$payload/runtime/node" ] || { echo 'Mac runtime missing. Ask your administrator for the complete built install ZIP.' >&2; exit 1; }
"$payload/runtime/node" "$kit/lib/verify-kit.js" "$kit" "$architecture"
employee_home=$("$payload/runtime/node" -p 'require("node:os").userInfo().homedir')
installed="$employee_home/Library/Application Support/CYBERORBIT/app"
run_installed() {
  [ -x "$installed/runtime/node" ] && [ -f "$installed/src/macos-user-install.js" ] || { echo 'CYBERORBIT is not installed in this account. Open Install-CYBERORBIT.command first.' >&2; return 1; }
  "$installed/runtime/node" "$installed/src/macos-user-install.js" "$@"
}
