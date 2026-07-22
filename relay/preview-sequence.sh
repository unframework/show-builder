#!/usr/bin/env bash
#
# preview-sequence.sh — render an xLights .xsq headless and stream it live to
# the simulator, with no xLights GUI interaction required.
#
#   xLights -hl  →  fseq-player.js  →  relay.js  →  browser simulator
#
# Usage:
#   ./preview-sequence.sh [path/to/sequence.xsq] [-- extra fseq-player.js args]
#
# Defaults to xlights/example-sequence.xsq if no path is given.
# Pass extra args after `--` to fseq-player.js, e.g. `-- --loop`.
#
# See ../CLI-PLAYBACK.md for the full writeup of how this works and why.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
XLIGHTS_BIN="${XLIGHTS_BIN:-/Applications/xLights.app/Contents/MacOS/xLights}"

# ── Parse args ────────────────────────────────────────────────────────────────
XSQ_PATH="$PROJECT_ROOT/xlights/example-sequence.xsq"
PLAYER_ARGS=()
if [[ $# -gt 0 && "$1" != "--" ]]; then
  XSQ_PATH="$1"
  shift
fi
if [[ $# -gt 0 && "$1" == "--" ]]; then
  shift
  PLAYER_ARGS=("$@")
fi

# Resolve to an absolute path — xLights' CLI silently no-ops on relative paths.
XSQ_PATH="$(cd "$(dirname "$XSQ_PATH")" && pwd)/$(basename "$XSQ_PATH")"
SHOW_DIR="$(dirname "$XSQ_PATH")"
FSEQ_PATH="${XSQ_PATH%.xsq}.fseq"

if [[ ! -f "$XSQ_PATH" ]]; then
  echo "error: sequence file not found: $XSQ_PATH" >&2
  exit 1
fi
if [[ ! -x "$XLIGHTS_BIN" ]]; then
  echo "error: xLights binary not found at $XLIGHTS_BIN (override with XLIGHTS_BIN=...)" >&2
  exit 1
fi

echo "== Render =="
echo "show dir : $SHOW_DIR"
echo "sequence : $XSQ_PATH"

# xLights is single-instance per show dir: a running GUI on this folder makes
# the headless render silently no-op instead of erroring. Detect that by
# checking whether the .fseq's mtime actually advances.
BEFORE_MTIME=""
if [[ -f "$FSEQ_PATH" ]]; then
  BEFORE_MTIME="$(stat -f %m "$FSEQ_PATH" 2>/dev/null || stat -c %Y "$FSEQ_PATH")"
fi

"$XLIGHTS_BIN" -s "$SHOW_DIR" -hl "$XSQ_PATH"

if [[ ! -f "$FSEQ_PATH" ]]; then
  echo "error: render did not produce $FSEQ_PATH." >&2
  echo "       Is an xLights GUI window already open on this show folder? Close it and retry." >&2
  exit 1
fi
AFTER_MTIME="$(stat -f %m "$FSEQ_PATH" 2>/dev/null || stat -c %Y "$FSEQ_PATH")"
if [[ -n "$BEFORE_MTIME" && "$BEFORE_MTIME" == "$AFTER_MTIME" ]]; then
  echo "error: render appears to have silently no-op'd (fseq unchanged)." >&2
  echo "       Is an xLights GUI window already open on this show folder? Close it and retry." >&2
  exit 1
fi
echo "rendered : $FSEQ_PATH"
echo

# ── Ensure relay is running ───────────────────────────────────────────────────
echo "== Relay =="
if lsof -i :3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "relay already running on :3001"
else
  echo "starting relay..."
  ( cd "$SCRIPT_DIR" && nohup node relay.js > /tmp/gothic-folly-relay.log 2>&1 & )
  for _ in $(seq 1 20); do
    lsof -i :3001 -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 0.25
  done
  if ! lsof -i :3001 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "error: relay did not start — check /tmp/gothic-folly-relay.log" >&2
    exit 1
  fi
  echo "relay started (log: /tmp/gothic-folly-relay.log)"
fi
echo

SIM_PATH="$PROJECT_ROOT/cathedral-3d-sim.html"
if command -v open >/dev/null 2>&1; then
  echo "opening simulator: $SIM_PATH"
  open "$SIM_PATH"
else
  echo "Open $SIM_PATH in a browser now if it isn't already."
fi
echo

# ── Play it back ──────────────────────────────────────────────────────────────
echo "== Playback =="
node "$SCRIPT_DIR/fseq-player.js" "$FSEQ_PATH" ${PLAYER_ARGS[@]+"${PLAYER_ARGS[@]}"}
