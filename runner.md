# Effect runner

A headless Node process that runs procedural effects and streams them out as
sACN/E1.31, controlled from a minimal web UI. Run `relay/` alongside to preview
it in the 3D sim, or point it at the real hardware.

## Locally

- `npm run runner` — control UI on http://localhost:3002, sACN to `127.0.0.1:5568`.
- `npm run build:runner` — bundle a dependency-free `dist-runner/` (server + UI +
  pixel-map); copy to any host and run `node start.mjs`.

## Deploy to a Raspberry Pi kiosk (manual, via Cloudflare Pages)

For when the Pi isn't on the dev machine's LAN. The bundle is published to a
Cloudflare Pages project (free, no billing) and pulled onto the Pi over HTTPS.

One-time setup (dev machine):

```bash
npm install                                                 # installs wrangler
npx wrangler login --device                                 # device-code OAuth (works headless/SSH)
npx wrangler pages project create gothic-folly-runner --production-branch main
```

Then per deploy:

```bash
npm run deploy:pages                                        # build + publish bundle to Pages
```

The bundle lands at
`https://gothic-folly-runner.pages.dev/gothic-folly-runner-latest.tar.gz`.

On the Pi (copy `deploy/pull-install.sh` there once; the systemd unit is assumed
already installed):

```bash
./pull-install.sh
```

`pull-install.sh` downloads that URL into `/opt/gothic-folly-runner` and restarts
the service; the persisted state at `/var/lib/gothic-folly-runner/` is untouched.
Override the source with `RUNNER_BUNDLE_URL`, or the project/key on the dev side
with `CF_PROJECT` / `BUNDLE_KEY`.

## Remote sim demo (Cloudflare Pages)

To poke at the 3D cathedral sim from anywhere (demo mode — no live sACN), publish
the browser app to its own Pages project:

```bash
npm run deploy:sim                                         # build + publish the sim UI
```

Live at `https://gothic-folly-sim.pages.dev/` (root serves the cathedral view). It
runs without the relay: pixel-map geometry loads from the wiki copy over CORS, and
the missing `localhost:3001` relay just leaves it in demo mode. One-time project
setup mirrors the runner: `npx wrangler pages project create gothic-folly-sim
--production-branch main`. Override the project with `CF_SIM_PROJECT`.

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
