# Show-Builder Version Log

**Current version: 2026-06-19**

This log tracks changes to the show-builder package. If you've already built sequences and a new version comes out, use this to decide what to update.

---

## Upgrading from a previous version

When a new package is released:

**Always safe to replace:**
`cathedral-3d-sim.html`, `arches-sim.html`, `rose-window-sim.html`, `pixel-map/`, `relay/`, `td/`, `getting-started.md`, `version_log.md`

**Check this log before replacing:**
`xlights/xlights_rgbeffects.xml` — this file defines the LED models. If models changed, replace it and re-render your sequences in xLights (press **F5**). If pixel counts changed, the log will say so — your sequences may look different and will need to be re-rendered before they'll work correctly on playa.

**Never replace (your work):**
Your own `.xsq` sequence files and any audio you've added.

---

## 2026-06-19

### What's new

- **Strip spec confirmed — all arch zones:** WS2811 24V 60/m, 10 pixels/m (6 LEDs per IC). Mini and quad arch pixel counts updated to match full hardware resolution.
- **Universe reassignment:** Quad arch pixel counts roughly doubled, pushing spires, canopy, and orbs to new universe ranges:
  - Quad arches: universes 32–51 (was 32–41)
  - Spires: 52–55 (was 42–45)
  - Canopy + corners: 56–57 (was 46–47)
  - Orbs: 58 (was 48)
- **Main arch pixel positions:** Exactly 20 pixels per arch, now placed at the true centre of each structural steel box (parsed from arch geometry). Previously evenly spaced along the arc length.
- **New: `arches-sim.html`** — arch-only 3D simulator (main, mini, and quad arches). Same live sACN and demo modes as the full cathedral sim.
- **Main arch boxes rendered as filled polygons** in both `cathedral-3d-sim.html` and `arches-sim.html`, matching the rose window cell style.
- **Hardware note (controller config, not code):** Main arches use 20 logical pixels per arch. Physical strips have ~240 WS2811 ICs. Set **grouping = 12** on the F48V5 pixel outputs so each logical pixel drives 12 consecutive ICs.

### Upgrade notes

**This is a significant update — pixel counts and universe assignments changed.**

Replace these files:
- `xlights/xlights_rgbeffects.xml` — model pixel counts changed for mini and quad arches
- `xlights/xlights_networks.xml` — universe assignments changed for quads, spires, canopy, orbs
- All files in `pixel-map/` — universe and channel maps rebuilt

After replacing, **re-render all sequences** (press **F5** in xLights). Sequences targeting spires, canopy, orbs, or quad arches will look correct again after re-render. Your `.xsq` files are safe — they reference models by name, not by channel.

---

## 2026-06-22

### What's new
- **Spire bottom pixel alignment:** The bottom LED on each spire strand now aligns with the nearby spirelet scaffold ring in the sim (was ~0.7m too high). Root causes: SPIRE_HEIGHT_M was set to 20ft rather than apex-to-spirelet distance; diagonal strands are longer than vertical height, so T_START needed a per-strand adjustment. All 4 spires corrected.
- **Left mini arch pixel order reversed:** On the left mini arches, pixel 0 now starts at the right/center-facing leg (toward the main arch zone) instead of the outer leg. This co-locates wiring connections near the main arch entry points, eliminating 5 long cable runs across the scaffold. xLights sweeps are unaffected (they use WorldPos, not pixel order).
- **Canopy pixel counts updated:** Diagonal runs: 43→44px. Side runs: 37→38px. Matches the counts in the Ray Wu custom order (extra pixel accounts for catenary sag not in the CAD geometry).

### Upgrade notes
Replace all files in `pixel-map/` and `xlights/` to get the corrected models. Re-render sequences (F5) after replacing — spire, canopy, and left mini arch sequences will update automatically. Your `.xsq` files are safe.

---

## 2026-06-05

### What's new
- **xLights — Rose Window addressing groups:** Added per-cell, per-row, and per-column sub-models for the Rose Window so you can target specific parts of it in sequences:
  - `Row-1` through `Row-7` — each ring layer (hub → rim)
  - `Col-A`, `Col-B`, `Col-C` — the three branch directions
  - `P01-1b` through `P16-7c` — all 224 individual cells
  - Groups in the sequencer: `Rose-Rows`, `Rose-Cols`, `Rose-Cells`, `Rose Window Elements`

### Upgrade notes
Models file (`xlights_rgbeffects.xml`) changed — replace it if upgrading. No pixel counts changed; existing sequences are fully compatible. Re-render (F5) after replacing.

---

## 2026-06-02

First public release of the show-builder package. Includes:
- xLights project with all LED zones: main arches, mini arches, quad arches, spires, spirelets, rose window, canopy, orbs
- Full nested group hierarchy (`Cathedral` → `Arches`, `Spires`, `Rose Window`, etc.)
- 3D browser simulator (`cathedral-3d-sim.html`) with live sACN preview, all zones
- Rose window simulator (`rose-window-sim.html`)
- Local relay server for live preview
- TouchDesigner starter patch and all-zones position data
