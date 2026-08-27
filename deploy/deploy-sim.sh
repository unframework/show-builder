#!/usr/bin/env bash
# Build the cathedral sim UI and publish it to Cloudflare Pages for ad-hoc remote play.
# Runs in demo mode (no relay); pixel-map geometry loads from the wiki copy over CORS.
#
# One-time setup:
#   npx wrangler login --device
#   npx wrangler pages project create gothic-folly-sim --production-branch main
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CF_PROJECT="${CF_SIM_PROJECT:-gothic-folly-sim}"

echo "==> Building app"
npm --prefix "$REPO" run build
cp "$REPO/dist/cathedral.html" "$REPO/dist/index.html"   # / serves the sim

echo "==> Deploying to Cloudflare Pages project $CF_PROJECT"
npx --prefix "$REPO" wrangler pages deploy "$REPO/dist" \
  --project-name "$CF_PROJECT" --branch main --commit-dirty=true

echo "==> Done. Sim: https://$CF_PROJECT.pages.dev/"
