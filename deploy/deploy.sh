#!/usr/bin/env bash
# Deploy the Gothic Folly effects runner to a Raspberry Pi kiosk.
# Builds the runner bundle, ships it, installs Node + a systemd service,
# and points TouchKio at the control UI.
#
#   ./deploy/deploy.sh [user@]host
#
# Target is a [user@]host reachable over passwordless ssh (with sudo).
set -euo pipefail

REMOTE="${1:?usage: deploy.sh [user@]host}"
HOSTNAME_ONLY="${REMOTE##*@}"
DEST="/opt/gothic-folly-runner"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building runner bundle"
npm --prefix "$REPO" run build:runner

echo "==> Ensuring Node is installed on $HOSTNAME_ONLY"
ssh "$REMOTE" 'command -v node >/dev/null 2>&1 || { curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs; }'

echo "==> Syncing bundle to $REMOTE:$DEST (root-owned)"
ssh "$REMOTE" "sudo mkdir -p $DEST"
rsync -az --delete --rsync-path="sudo rsync" "$REPO/dist-runner/" "$REMOTE:$DEST/"

echo "==> Installing systemd service"
scp "$REPO/deploy/gothic-folly-runner.service" "$REMOTE:/tmp/gothic-folly-runner.service"
ssh "$REMOTE" 'sudo mv /tmp/gothic-folly-runner.service /etc/systemd/system/gothic-folly-runner.service
sudo systemctl daemon-reload
sudo systemctl enable gothic-folly-runner.service
sudo systemctl restart gothic-folly-runner.service'

echo "==> Pointing TouchKio at the runner UI (if installed)"
ssh "$REMOTE" 'CFG="$HOME/.config/touchkio/Arguments.json"
if [ ! -f "$CFG" ]; then echo "TouchKio config not found — skipping (install/configure TouchKio to use the touchscreen kiosk)."; exit 0; fi
node -e "const fs=require(\"fs\"),f=process.argv[1],c=JSON.parse(fs.readFileSync(f,\"utf8\"));c.web_url=[...new Set([\"http://localhost:3002\",...(c.web_url||[])])];fs.writeFileSync(f,JSON.stringify(c,null,2)+\"\n\")" "$CFG"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user restart touchkio.service || true
echo "TouchKio now leads with http://localhost:3002 (existing pages kept as switchable tabs)."'

echo "==> Done. Control UI: http://$HOSTNAME_ONLY:3002/ (also reachable from your phone on the LAN)."
echo "    Touchscreen shows the runner UI via TouchKio."
