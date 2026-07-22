"""
generate-full-patch.py — Gothic Folly: Full Cathedral TouchDesigner Patch

HOW TO USE:
  1. Open TouchDesigner (2023.11 or later recommended)
  2. File menu → Textport (or press Alt+T)
  3. In the Textport, run this with the real path to this file:
         p = r'/path/to/show-builder/td/generate-full-patch.py'; __file__ = p; exec(compile(open(p, encoding='utf-8').read(), p, 'exec'))
  4. A "gothic_folly" component will appear in /project1.

WHAT IT CREATES:
  /project1/gothic_folly/
    pixel_positions      — Table DAT with all ~4,600 pixel positions + normalized coords
    effect_top           — GLSL TOP: animated spatial sweep effect (1024×1024)
    effect_shader        — Text DAT with the GLSL shader source
    pixel_sample         — Script CHOP: samples effect_top at each pixel's (z_norm, y_norm)
    pixel_sample_script  — Text DAT with the Script CHOP Python code
    sacn_out             — sACN Out CHOP: universes 7–75 → relay or F48V5
    info_text            — Text DAT: quick reference card

ARCHITECTURE:
  [effect_top] → [pixel_sample CHOP] → [sacn_out CHOP] → relay → browser sim
                                                         → F48V5 → LEDs (on playa)

  effect_top is a 1024×1024 GLSL texture. The starter effect is an animated
  horizontal sweep using z_norm so you immediately see color moving left-to-right
  across the whole cathedral in 3D space.

  pixel_sample samples effect_top at (z_norm, y_norm) for each pixel — z_norm is
  left/right position (0=left, 1=right), y_norm is height (0=ground, 1=top).

SPATIAL COORDINATES (from all-pixels-positions.csv):
  x_norm  — depth, 0=front (playa-facing) to 1=back
  y_norm  — height, 0=ground to 1=top of spires
  z_norm  — left-right, 0=left to 1=right

  Swap the UV sampling axes in pixel_sample_script to make effects sweep in
  different directions (e.g. height-based: use y_norm as the U coordinate).

ADJUSTING THE sACN TARGET:
  Select sacn_out → Parameters → Network Address:
    127.0.0.1   = relay running on same Mac (development)
    <F48V5 IP>  = direct to Falcon controller (playa)

THE ROSE WINDOW IS A SEPARATE PATH (not in this component):
  This patch drives the cathedral zones on universes 7–75. The rose window is
  designed at the cell level (u1–2) in xLights and its physical LEDs are expanded
  offline by pixel-map/expand-fseq.py (u76+); it is not driven from this TD patch.
  generate-patch.py builds a standalone rose_window component for cell-level
  previewing only.
"""

import csv, os

# ── Helpers ───────────────────────────────────────────────────────────────────

def make_op(parent_comp, op_type, name, x, y):
    """Create an operator, or return existing one."""
    existing = parent_comp.op(name)
    if existing:
        return existing
    node = parent_comp.create(op_type, name)
    node.nodeX = x
    node.nodeY = y
    return node

def make_op_by_type_names(parent_comp, op_type_names, name, x, y):
    """Create an operator by trying several TouchDesigner type spellings."""
    existing = parent_comp.op(name)
    if existing:
        return existing

    last_error = None
    for op_type_name in op_type_names:
        op_type = globals().get(op_type_name, op_type_name)
        try:
            node = parent_comp.create(op_type, name)
            node.nodeX = x
            node.nodeY = y
            return node
        except Exception as e:
            last_error = e

    names = ", ".join(op_type_names)
    raise RuntimeError(f"Could not create {name}; tried operator types: {names}") from last_error

def make_optional_op_by_type_names(parent_comp, op_type_names, name, x, y, fallback_type, fallback_name):
    """Create an operator, or a fallback placeholder if this TD build lacks it."""
    try:
        return make_op_by_type_names(parent_comp, op_type_names, name, x, y)
    except RuntimeError as e:
        print(f"Warning: {e}")
        print(f"Warning: creating {fallback_name} placeholder instead of {name}. Add a DMX/sACN output CHOP manually if needed.")
        return make_op(parent_comp, fallback_type, fallback_name, x, y)

def set_first_available_par(node, names, value):
    """Set the first parameter name that exists on this TouchDesigner build."""
    for name in names:
        if hasattr(node.par, name):
            setattr(node.par, name, value)
            return name
    print(f"Warning: {node.path} has none of these parameters: {', '.join(names)}")
    return None

# ── Locate all-pixels-positions.csv ──────────────────────────────────────────
_script_dir = os.path.dirname(os.path.abspath(vars().get('__file__', __file__) if '__file__' in vars() else '.'))
_csv_path   = os.path.join(_script_dir, 'all-pixels-positions.csv')
if not os.path.exists(_csv_path):
    raise FileNotFoundError(f"all-pixels-positions.csv not found at {_csv_path}")

_pixels = []
with open(_csv_path) as f:
    for row in csv.DictReader(f):
        _pixels.append(row)

print(f"Loaded {len(_pixels)} pixel positions from {_csv_path}")

_universes = sorted(set(int(r['universe']) for r in _pixels))
BASE_UNIVERSE = min(_universes)
N_UNIVERSES   = max(_universes) - BASE_UNIVERSE + 1
CHOP_CHANNELS = N_UNIVERSES * 510  # full DMX flat array for universes 7–75

print(f"Universes: {BASE_UNIVERSE}–{BASE_UNIVERSE + N_UNIVERSES - 1}  ({len(_universes)} used)")
print(f"Script CHOP output: {N_UNIVERSES} × 510 = {CHOP_CHANNELS} channels")

# ── Build the patch ───────────────────────────────────────────────────────────

root = op('/project1')
comp = make_op(root, containerCOMP, 'gothic_folly', 0, 0)

# 1. Pixel positions Table DAT ─────────────────────────────────────────────────
tbl = make_op(comp, tableDAT, 'pixel_positions', -600, 0)
tbl.clear()
headers = ['zone', 'pixel_id', 'universe', 'channel',
           'cat_x', 'cat_y', 'cat_z', 'x_norm', 'y_norm', 'z_norm']
tbl.appendRow(headers)
for row in _pixels:
    tbl.appendRow([row[h] for h in headers])
print("Created pixel_positions DAT")

# 2. Effect TOP — GLSL animated spatial sweep ──────────────────────────────────
glsl = make_op(comp, glslTOP, 'effect_top', -300, 0)
glsl.par.resolution1 = 1024
glsl.par.resolution2 = 1024

# Starter effect: animated horizontal sweep across z_norm (left-right)
# with a vertical height gradient.  Swap axes, change colors, or replace
# entirely with any other TOP network.
glsl_code = '''\
// Gothic Folly — Full Cathedral starter GLSL effect
//
// UV mapping used by pixel_sample:
//   uv.x = z_norm  (0=left, 1=right)
//   uv.y = y_norm  (0=ground, 1=top of spires)
//
// iTime: seconds since start (built-in TD uniform)

uniform float iTime;
out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;
    float z = uv.x;  // left–right
    float y = uv.y;  // height

    // Animated left-to-right sweep
    float sweep = 0.5 + 0.5 * sin(z * 6.2832 - iTime * 1.5);

    // Height gradient for visual depth
    float vert = y;

    vec3 color = vec3(
        sweep,
        vert * (1.0 - sweep * 0.5),
        1.0 - vert
    );

    fragColor = vec4(color, 1.0);
}
'''

shader_dat = make_op(comp, textDAT, 'effect_shader', -500, -150)
shader_dat.text = glsl_code
glsl.par.pixeldat = shader_dat.path
print("Created effect_top (GLSL spatial sweep)")

# 3. Script CHOP — sample effect_top at each pixel's (z_norm, y_norm) ─────────
#
# Output: CHOP_CHANNELS values, one per DMX slot across universes 7–75.
# Channel index = (universe - BASE_UNIVERSE) * 510 + (dmx_channel - 1)
# so channel index 0 → Universe 7 Ch 1, index 509 → Universe 7 Ch 510, etc.
#
# The sACN Out CHOP (universe=BASE_UNIVERSE, universes=N_UNIVERSES → 7..75) maps by position:
# CHOP ch 0 → Universe 7 DMX Ch 1, ch 1 → Ch 2, ... ch 510 → Universe 8 Ch 1.

script_chop = make_op(comp, scriptCHOP, 'pixel_sample', 0, 0)

sample_script = f'''\
# pixel_sample — Script CHOP
# Samples effect_top at each pixel's (z_norm, y_norm) spatial position.
# Outputs a flat DMX array: {N_UNIVERSES} universes × 510 channels = {CHOP_CHANNELS} values.
# Channel ordering: [u{BASE_UNIVERSE}c1, u{BASE_UNIVERSE}c2, ..., u{BASE_UNIVERSE}c510, ...]
#
# Also sends E1.31/sACN UDP packets directly to the local relay. This bypasses
# TouchDesigner builds that do not include a native sACN/DMX Out CHOP.

import socket
import uuid

SACN_HOST = "127.0.0.1"
SACN_PORT = 5568
SACN_SOURCE_NAME = "Gothic Folly TD"

_sacn_socket = None
_sacn_cid = uuid.uuid4().bytes
_sacn_sequence = 0

def _u16be(buf, offset, value):
    buf[offset:offset + 2] = int(value).to_bytes(2, "big")

def _u32be(buf, offset, value):
    buf[offset:offset + 4] = int(value).to_bytes(4, "big")

def _make_sacn_packet(universe, dmx_values, sequence):
    dmx = bytes(max(0, min(255, int(round(v * 255)))) for v in dmx_values)
    prop_count = len(dmx) + 1
    packet = bytearray(126 + len(dmx))

    _u16be(packet, 0, 0x0010)  # preamble size
    _u16be(packet, 2, 0x0000)  # postamble size
    packet[4:16] = b"ASC-E1.17\\x00\\x00\\x00"

    _u16be(packet, 16, 0x7000 | (len(packet) - 16))
    _u32be(packet, 18, 0x00000004)  # VECTOR_ROOT_E131_DATA
    packet[22:38] = _sacn_cid

    _u16be(packet, 38, 0x7000 | (len(packet) - 38))
    _u32be(packet, 40, 0x00000002)  # VECTOR_E131_DATA_PACKET
    source = SACN_SOURCE_NAME.encode("utf-8")[:63]
    packet[44:44 + len(source)] = source
    packet[108] = 100  # priority
    _u16be(packet, 109, 0)  # sync address
    packet[111] = sequence & 0xff
    packet[112] = 0  # options
    _u16be(packet, 113, universe)

    _u16be(packet, 115, 0x7000 | (len(packet) - 115))
    packet[117] = 0x02  # VECTOR_DMP_SET_PROPERTY
    packet[118] = 0xa1  # address/data type
    _u16be(packet, 119, 0)  # first property address
    _u16be(packet, 121, 1)  # address increment
    _u16be(packet, 123, prop_count)
    packet[125] = 0  # DMX start code
    packet[126:] = dmx
    return packet

def _send_sacn(values, base_universe, universes):
    global _sacn_socket, _sacn_sequence
    if _sacn_socket is None:
        _sacn_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    for i in range(universes):
        start = i * 510
        end = start + 510
        packet = _make_sacn_packet(base_universe + i, values[start:end], _sacn_sequence)
        _sacn_socket.sendto(packet, (SACN_HOST, SACN_PORT))

    _sacn_sequence = (_sacn_sequence + 1) & 0xff

def cook(scriptOp):
    scriptOp.clear()

    effect  = scriptOp.parent().op("effect_top")
    tbl     = scriptOp.parent().op("pixel_positions")
    base_u  = {BASE_UNIVERSE}
    n_ch    = {CHOP_CHANNELS}

    # Pre-allocate all DMX slots as 0
    values = [0.0] * n_ch

    for r in range(1, tbl.numRows):  # skip header row
        uni    = int(tbl[r, "universe"])
        ch     = int(tbl[r, "channel"])
        z_norm = float(tbl[r, "z_norm"])   # left–right: use as U
        y_norm = float(tbl[r, "y_norm"])   # height:     use as V

        # Sample the effect texture at this pixel's spatial position
        pixel = effect.sample(u=z_norm, v=y_norm)

        # Map to flat DMX index: R=ch, G=ch+1, B=ch+2 (1-based ch within universe)
        base_idx = (uni - base_u) * 510
        r_idx = base_idx + (ch - 1)
        g_idx = base_idx + ch
        b_idx = base_idx + (ch + 1)

        if r_idx < n_ch: values[r_idx] = pixel[0]
        if g_idx < n_ch: values[g_idx] = pixel[1]
        if b_idx < n_ch: values[b_idx] = pixel[2]

    _send_sacn(values, base_u, {N_UNIVERSES})

    # Keep the CHOP itself tiny. Rebuilding 35k visible channels every frame
    # makes TouchDesigner stutter; the DMX payload is sent over UDP above.
    status = scriptOp.appendChan("sent")
    status[0] = _sacn_sequence
'''

script_dat = make_op(comp, textDAT, 'pixel_sample_script', -200, -150)
script_dat.text = sample_script
script_chop.par.callbacks = script_dat.path
print("Created pixel_sample Script CHOP")

# 4. Frame Execute DAT — force continuous streaming ────────────────────────────
frame_exec = make_op(comp, executeDAT, 'stream_every_frame', 0, -300)
frame_exec.text = '''\
# stream_every_frame — Execute DAT
# Forces pixel_sample to cook every frame so its Python sACN sender keeps the
# browser relay alive even when no native output CHOP is present.

def onFrameStart(frame):
    if frame % 2 == 0:
        op("pixel_sample").cook(force=True)
    return
'''
set_first_available_par(frame_exec, ['framestart', 'frameStart'], True)
print("Created stream_every_frame Execute DAT")

# 5. sACN Out CHOP ─────────────────────────────────────────────────────────────
sacn = make_optional_op_by_type_names(
    comp,
    ['sACNoutCHOP', 'sACNOutCHOP', 'sacnOutCHOP', 'sacnoutCHOP',
     'dmxoutCHOP', 'dmxOutCHOP', 'DMXoutCHOP', 'DMXOutCHOP'],
    'sacn_out',
    300,
    0,
    nullCHOP,
    'sacn_out_missing'
)
set_first_available_par(sacn, ['netaddress', 'networkaddress'], '127.0.0.1')
set_first_available_par(sacn, ['universe', 'startuniverse'], BASE_UNIVERSE)
set_first_available_par(sacn, ['universes', 'numuniverses'], N_UNIVERSES)
script_chop.outputConnectors[0].connect(sacn)
print(f"Created {sacn.name} output node (universes {BASE_UNIVERSE}–{BASE_UNIVERSE + N_UNIVERSES - 1} → 127.0.0.1 when using sACN/DMX Out)")

# 6. Info Text DAT ─────────────────────────────────────────────────────────────
info = make_op(comp, textDAT, 'info_text', -600, -300)
info.text = f"""\
GOTHIC FOLLY — Full Cathedral TouchDesigner patch
==================================================

Drives {len(_pixels)} pixels across {len(_universes)} universes ({BASE_UNIVERSE}–{BASE_UNIVERSE + N_UNIVERSES - 1}).

Universe map:
  17–21   Main arches (5)
  22–26   Mini arches — left (5)
  27–31   Mini arches — right (5)
  32–35   Quad arches — front top left/right (u32–33, u34–35)
  36–37   Quad arches — back top left/right
  38–41   Quad arches — back bottom left/right (u38–39, u40–41)
  42–45   Spires: front-left, front-right, back-left, back-right
  46      Spirelets ch1–60 + Canopy ch61+
  47      Canopy (overflow)
  48      Orbs (20 × RGB)

Spatial coordinates (from all-pixels-positions.csv):
  x_norm  0=front (playa-facing)  1=back
  y_norm  0=ground                1=top of spires (~18.7 m)
  z_norm  0=left                  1=right

Starter effect samples at (z_norm, y_norm): left-right sweep + height gradient.
To change the effect: edit effect_shader (GLSL) or replace effect_top entirely.
To sweep front-to-back: in pixel_sample_script, sample at (x_norm, y_norm).

sACN target:
  Development → 127.0.0.1 (relay.js on your Mac)
  On playa    → <F48V5 IP> (set in sacn_out parameters)

Rose window is a separate path — designed at cell level (u1–2) in xLights,
physical LEDs expanded offline by expand-fseq.py (u76+); not driven from here.
Run generate-patch.py only for a standalone cell-level rose_window preview.
"""

print("")
print(f"✓ Patch created: /project1/gothic_folly")
print("  Select gothic_folly and press 'Enter network' to open it.")
print("  Start the relay: cd relay && npm install && node relay.js")
print("  Then watch the browser simulator go LIVE.")
print("")
print("  TIP: The rose window is a separate component (generate-patch.py).")
