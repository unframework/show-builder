#!/usr/bin/env bash
# Build the runner bundle and publish it to Cloudflare Pages for manual Pi install.
#
# One-time setup:
#   npm install
#   npx wrangler login --device            # RFC 8628 device flow (works over SSH/headless)
#   npx wrangler pages project create gothic-folly-runner --production-branch main
#
# Per deploy: run this, then on the Pi run deploy/pull-install.sh.
# The bundle lands at https://<project>.pages.dev/<key>.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CF_PROJECT="${CF_PROJECT:-gothic-folly-runner}"
BUNDLE_KEY="${BUNDLE_KEY:-gothic-folly-runner-latest.tar.gz}"
STAGE="$REPO/dist-pages"

echo "==> Building runner bundle"
npm --prefix "$REPO" run build:runner

echo "==> Staging archive → $STAGE/$BUNDLE_KEY"
rm -rf "$STAGE"
mkdir -p "$STAGE"
tar -czf "$STAGE/$BUNDLE_KEY" -C "$REPO/dist-runner" .

echo "==> Deploying to Cloudflare Pages project $CF_PROJECT"
npx --prefix "$REPO" wrangler pages deploy "$STAGE" \
  --project-name "$CF_PROJECT" --branch main --commit-dirty=true

echo "==> Done. Bundle: https://$CF_PROJECT.pages.dev/$BUNDLE_KEY"
echo "    On the Pi: ./pull-install.sh (or override RUNNER_BUNDLE_URL)"
