#!/bin/sh
# Run after building agent/nemu. Installs the menu-bar process at login.
set -eu
: "${NEMU_URL:?Set NEMU_URL to your hosted HTTPS origin}"
case "$NEMU_URL" in https://*[\<\>\&\"\']*) echo 'Invalid URL' >&2; exit 1;; https://*) ;; *) echo 'HTTPS required' >&2; exit 1;; esac
nemu_install_dir="$HOME/Library/Application Support/nemu"
mkdir -p "$nemu_install_dir" "$HOME/Library/LaunchAgents"
chmod 700 "$nemu_install_dir"
cp agent/nemu "$nemu_install_dir/nemu"
export NEMU_INSTALL_DIR="$nemu_install_dir"
python3 - <<'PY'
import os, plistlib
p=os.path.expanduser('~/Library/LaunchAgents/app.nemu.agent.plist')
with open(p,'wb') as f:
 plistlib.dump({'Label':'app.nemu.agent','ProgramArguments':[os.environ['NEMU_INSTALL_DIR']+'/nemu','-url',os.environ['NEMU_URL']],'RunAtLoad':True,'KeepAlive':False,'ProcessType':'Interactive'},f)
PY
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/app.nemu.agent.plist"
printf '%s\n' 'nemu installed. Use the menu-bar Pair this browser action.'
