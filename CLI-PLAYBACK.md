# CLI sequence preview — render + stream without the xLights GUI

This is a shell-scriptable path from an `.xsq` sequence file to the live 3D
simulator, with no manual clicking in xLights. It's meant for a workflow where
a sequence's XML is edited programmatically (e.g. by an AI) and you want to
see the result immediately.

```
edit example-sequence.xsq (XML)
          │
          ▼
xLights -hl   (headless render, no GUI, <1s)
          │
          ▼
example-sequence.fseq   (binary rendered channel data)
          │
          ▼
fseq-player.js   (decodes fseq, streams it as real sACN/E1.31 UDP)
          │
          ▼
relay.js   (UDP :5568 → WebSocket :3001)
          │
          ▼
cathedral-3d-sim.html   (browser, shows ● LIVE)
```

## Quick start

```bash
cd relay
./preview-sequence.sh                              # plays xlights/example-sequence.xsq
./preview-sequence.sh /path/to/your-sequence.xsq    # plays a specific sequence
./preview-sequence.sh /path/to/your-sequence.xsq -- --loop   # loop playback
```

The script opens `cathedral-3d-sim.html` in your default browser automatically
(via macOS `open`) — it'll show **● LIVE** once frames start arriving.

The script does four things, in order:
1. Renders the `.xsq` headless via the xLights CLI, producing a `.fseq`.
2. Starts `relay.js` if it isn't already running (checks port 3001).
3. Opens `cathedral-3d-sim.html` in the browser.
4. Runs `fseq-player.js` to stream the rendered `.fseq` as sACN to the relay.

## The pieces, if you want to run them by hand

**1. Headless render** — turns edited XML into rendered channel data, no GUI:

```bash
/Applications/xLights.app/Contents/MacOS/xLights \
  -s /absolute/path/to/xlights \
  -hl /absolute/path/to/xlights/example-sequence.xsq
```

Gotchas:
- **Paths must be absolute.** Relative paths cause the CLI to silently no-op.
- **xLights is single-instance per show folder.** If a GUI window already has
  that folder open, the headless call silently does nothing — no error, no
  `.fseq` written. Close the GUI window first. (`preview-sequence.sh` detects
  this by checking whether the `.fseq`'s mtime actually changed, and fails
  loudly instead of silently playing stale data.)

**2. The relay** (unchanged from the main workflow):

```bash
cd relay && node relay.js
```

Listens for sACN on UDP `:5568`, forwards to the browser sim over WebSocket
`:3001`.

**3. The player** — `relay/fseq-player.js` reads a `.fseq` file and re-emits
it as real E1.31/sACN UDP packets, exactly as if xLights itself were playing
the sequence with "Output to Lights" on:

```bash
node relay/fseq-player.js path/to/sequence.fseq [--host 127.0.0.1] [--port 5568] [--loop]
```

There's no CLI flag in xLights to trigger live playback+output — that's
normally tied to clicking Play in the GUI. This script sidesteps that
entirely by decoding the rendered `.fseq` binary directly, so the whole loop
runs from the shell with zero GUI interaction.

### How fseq-player.js works

It implements the xLights FSEQ v2 file format (verified against the xLights
source, `src-core/render/FSEQFile.cpp`):
- 32-byte fixed header (magic, channel count, frame count, step time, compression type).
- A compression block table (each block spans a run of frames, independently
  zstd-compressed — decompressed via the system `zstd` CLI).
- A sparse channel-range table (xLights skips channels no effect ever touches;
  the player expands each frame back out to full per-universe channel layout).
- Frames are then split into per-universe DMX payloads (510 channels/universe,
  matching this project's `xlights_networks.xml`) and sent as E1.31 packets
  matching the exact byte layout `relay.js` validates.

Only FSEQ v2 with `none`/`zstd` compression is supported (xLights' default).
zlib-compressed files aren't handled.

## Requirements

- Node.js (already required for the relay)
- The `zstd` CLI (`brew install zstd` if missing — used to decompress FSEQ
  compression blocks)
- xLights installed at `/Applications/xLights.app` (override the path with
  the `XLIGHTS_BIN` env var)
