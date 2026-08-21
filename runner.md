# Effect runner

A headless Node process that runs procedural effects and streams them out as
sACN/E1.31, controlled from a minimal web UI. Run `relay/` alongside to preview
it in the 3D sim, or point it at the real hardware.

## Locally

- `npm run runner` — control UI on http://localhost:3002, sACN to `127.0.0.1:5568`.
- `npm run build:runner` — bundle a dependency-free `dist-runner/` (server + UI +
  pixel-map); copy to any host and run `node start.mjs`.

## Deploy to a Raspberry Pi kiosk

```bash
./deploy/deploy.sh [user@]host
```

Needs passwordless `ssh` + `sudo` on the target. If TouchKio is installed, it's
pointed at the runner UI as its lead page.

Set the sACN target with `SACN_HOST` / `SACN_PORT` in the unit (or a drop-in), or
change it live from the control UI. The UI is reachable from any device on the LAN
at `http://<host>:3002/`.

The sACN destination and the live knobs (effect, running, speed, bpm) persist to
`.runner-state/settings.json` (or in `/var/lib/gothic-folly-runner/`) and are restored on restart.

```bash
ssh <host> sudo systemctl status gothic-folly-runner    # state
ssh <host> sudo journalctl -u gothic-folly-runner -f    # logs
```
