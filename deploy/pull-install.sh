#!/usr/bin/env bash
# Pull the latest runner bundle from Cloudflare Pages and install it. Run on the Pi.
#
#   ./pull-install.sh
#   RUNNER_BUNDLE_URL=https://gothic-folly-runner.pages.dev/gothic-folly-runner-latest.tar.gz ./pull-install.sh
#
# The systemd unit (deploy/gothic-folly-runner.service) and the persisted state at
# /var/lib/gothic-folly-runner/ are left untouched. Extraction overlays files without
# pruning, so a renamed asset from a prior build could linger — harmless for this bundle.
set -euo pipefail

URL="${RUNNER_BUNDLE_URL:-https://gothic-folly-runner.pages.dev/gothic-folly-runner-latest.tar.gz}"
DEST="${DEST:-/opt/gothic-folly-runner}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Downloading $URL"
curl -fsSL "$URL" -o "$TMP/bundle.tar.gz"

echo "==> Extracting into $DEST"
sudo mkdir -p "$DEST"
sudo tar -xzf "$TMP/bundle.tar.gz" -C "$DEST"

echo "==> Restarting gothic-folly-runner"
sudo systemctl restart gothic-folly-runner

echo "==> Done. Control UI: http://$(hostname):3002/"
