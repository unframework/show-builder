#!/usr/bin/env bash
# Build the runner bundle and upload it to Cloudflare R2 for manual Pi install.
#
# One-time setup:
#   npm install
#   npx wrangler login
#   npx wrangler r2 bucket create "$R2_BUCKET"
#   npx wrangler r2 bucket dev-url enable "$R2_BUCKET"   # → public pub-xxxx.r2.dev URL
#
# Per deploy: run this, then on the Pi run deploy/pull-install.sh.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
R2_BUCKET="${R2_BUCKET:-gothic-folly-runner}"
R2_KEY="${R2_KEY:-gothic-folly-runner-latest.tar.gz}"
ARCHIVE="$REPO/dist-runner.tar.gz"

echo "==> Building runner bundle"
npm --prefix "$REPO" run build:runner

echo "==> Archiving dist-runner/ → $ARCHIVE"
tar -czf "$ARCHIVE" -C "$REPO/dist-runner" .

echo "==> Uploading to R2: $R2_BUCKET/$R2_KEY"
npx --prefix "$REPO" wrangler r2 object put "$R2_BUCKET/$R2_KEY" --file "$ARCHIVE" --remote

echo "==> Done. On the Pi: RUNNER_BUNDLE_URL=<r2.dev url> ./pull-install.sh"
