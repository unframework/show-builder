# Effect runner

A headless Node process that runs procedural effects and streams them out as
sACN/E1.31, controlled from a minimal web UI. Run `relay/` alongside to preview
it in the 3D sim, or point it at the real hardware.

## Locally

- `npm run runner` — control UI on http://localhost:3002, sACN to `127.0.0.1:5568`.
- `npm run build:runner` — bundle a dependency-free `dist-runner/` (server + UI +
  pixel-map); copy to any host and run `node start.mjs`.

## Deploy to a Raspberry Pi kiosk (manual, via Cloudflare R2)

For when the Pi isn't on the dev machine's LAN. The bundle is uploaded to an R2
bucket, then pulled onto the Pi.

One-time setup (dev machine):

```bash
npm install                                                 # installs wrangler
npx wrangler login                                          # browser OAuth
npx wrangler r2 bucket create gothic-folly-runner
npx wrangler r2 bucket dev-url enable gothic-folly-runner   # → public pub-xxxx.r2.dev URL
```

Then per deploy:

```bash
npm run deploy:r2                                           # build + upload bundle to R2
```

On the Pi (copy `deploy/pull-install.sh` there once; the systemd unit is assumed
already installed):

```bash
RUNNER_BUNDLE_URL=https://pub-xxxx.r2.dev/gothic-folly-runner-latest.tar.gz ./pull-install.sh
```

`pull-install.sh` downloads the bundle into `/opt/gothic-folly-runner` and restarts
the service; the persisted state at `/var/lib/gothic-folly-runner/` is untouched.

Override the bucket/key with `R2_BUCKET` / `R2_KEY` env vars if needed.

### Legacy LAN deploy

`./deploy/deploy.sh [user@]host` pushed the bundle straight to the Pi over
passwordless `ssh` + `sudo` and repointed TouchKio. It's disabled (the remote steps
are commented out) since the Pi moved off our Wi-Fi — re-enable by uncommenting the
block in that file if the Pi is ever reachable on the LAN/Tailscale again.

Set the sACN target with `SACN_HOST` / `SACN_PORT` in the unit (or a drop-in), or
change it live from the control UI. The UI is reachable from any device on the LAN
at `http://<host>:3002/`.

The sACN destination and the live knobs (effect, running, speed, bpm) persist to
`.runner-state/settings.json` (or in `/var/lib/gothic-folly-runner/`) and are restored on restart.

```bash
ssh <host> sudo systemctl status gothic-folly-runner    # state
ssh <host> sudo journalctl -u gothic-folly-runner -f    # logs
```
