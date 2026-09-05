import { createNoise4D, type NoiseFunction4D } from 'simplex-noise';
import { defineKind, slot, type LayerDef, type LayerKind } from './layers';
import {
  beatSpike,
  ramp2,
  smoothstep,
  threshold,
  verticalFade,
  type Ramp,
  type RampPoint,
} from './stages';
import type { KnobSchema } from './knobs';
import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import type { ZoneId } from '../scene/zones';

export interface EffectInput {
  index: number;
  xn: number;
  yn: number;
  zn: number;
  phase: number;
  // Fractional beats since the last cue; integer crossings are downbeats.
  beat: number;
  bpm: number;
  twinkleOffset: number;
}

// stable stuff reused across hot-reloads
export interface DemoEffectContext {
  noise4D: NoiseFunction4D;
}

export function createDemoEffectContext(): DemoEffectContext {
  return { noise4D: createNoise4D() };
}

// Everything a layer kind's paint closes over, resolved once per engine build.
export interface EffectRuntime {
  noise4D: NoiseFunction4D;
  focus: Vec3;
  strands: StrandField;
  rings: RingSample[];
}

const bell = (p: number) => Math.pow(Math.max(0, Math.cos(p * Math.PI)), 2);
const wrap = (x: number) => ((x % 1) + 1) % 1;
// A cosine-bell crest travelling along a scalar coordinate: `freq` crests per
// unit, slid by `offset` (an integrated scroll phase plus any beat shove).
const travelingBand = (coord: number, freq: number, offset: number) =>
  bell(wrap(coord * freq - offset));
// A travelling crest peaking once per cycle. `mid` places the low point between
// crests (0.5 = symmetric; away from it skews the rise/fall balance); `sharp` sets
// how pointed the crest is — below 1 broad and soft, above 1 a narrow spike.
const skewedCrest = (coord: number, freq: number, offset: number, mid: number, sharp: number) => {
  const p = wrap(coord * freq - offset);
  const dist = p <= mid ? p / mid : (1 - p) / (1 - mid);
  return Math.pow(1 - dist, sharp);
};
// Angular gap (radians) to the nearest arm of a two-armed axis through the origin:
// folded into [0, π/2] so a direction and its opposite read identically.
const axisGap = (a: number) => {
  const m = ((a % Math.PI) + Math.PI) % Math.PI;
  return Math.min(m, Math.PI - m);
};

const NOISE_SCALE = 6.5;
const NOISE_TIME = 0.4;
const NOISE_THRESHOLD = 0;
// Half-width of the black↔white ramp around the threshold, in noise units.
// 0 = hard edge; larger = softer, more gradient between blobs.
const NOISE_EDGE = 0.07;
// Radial frequency falloff: the noise runs at full detail at the focus and
// coarsens outward. Smaller = blobs grow bigger, faster, with distance.
const NOISE_FOCUS_FALLOFF = 0.15;
const NOISE_RISE = -2;
const PULSE_DEPTH = 0.05;
// Decay time constant of the kick spike, seconds (~fully dropped by ~3×).
const PULSE_DECAY = 0.07;
// How far the pattern pops outward from the focus on each kick (fraction of scale).
const PULSE_EXPAND = 0.1;
// Blob color ramp: troughs → cores, plus the beat's lightness gain and the
// height-driven hue tint layered on top.
const NOISE_RAMP_START: RampPoint = { h: -0.2, s: 1, l: 0 };
const NOISE_RAMP_END: RampPoint = { h: 0.05, s: 1, l: 0.5 };
// A cool tint multiplied over the field near the floor, fading to white (no tint)
// at the crown — the height colouring the standalone noise effect layers on top.
const NOISE_HEIGHT_RAMP_FLOOR: RampPoint = { h: 0.9, s: 0.5, l: 0.85 };
const NOISE_HEIGHT_RAMP_CROWN: RampPoint = { h: 0, s: 0, l: 1 };
// The beat pulse multiplies its ramp over the field: white at rest (a no-op) so
// only the downbeat throbs, deepening toward a warm core at the flash's peak.
const NOISE_FLASH_RAMP_LOW: RampPoint = { h: 0, s: 0, l: 1 };
const NOISE_FLASH_RAMP_HIGH: RampPoint = { h: 0.03, s: 0.9, l: 0.5 };
const NOISE_KICK_LIGHT = 0.2;
// Feature count across the unit sphere the rays pierce. Smaller = fewer, broader shafts.
const RAY_NOISE_SCALE = 3;
const RAY_NOISE_DEPTH = 0.08; // zero means purely ignoring cathedral depth
const RAY_EXPAND = 0.2;
// Horizontal detail multiplier at the floor, ramping to full (1) at the top:
// compresses the sampled X-coord low down so the bottom reads coarser than the crown.
const RAY_DETAIL_FLOOR = 0.05;
// Rays palette: the color ramp plus the beat's lightness gain screened on top.
const RAY_KICK_LIGHT = 0.6;
const RAY_RAMP_START: RampPoint = { h: -0.2, s: 1, l: 0 };
const RAY_RAMP_END: RampPoint = { h: 0.05, s: 1, l: 0.5 };

// Concentric ripples radiating from the rose window.
// Rings per unit distance from the focus.
const RING_FREQ = 18;
// Outward drift of the ring pattern per phase unit.
const RING_SPEED = 1.8;
// Extra outward shove injected on each kick, in ring widths.
const RING_EXPAND = 0.4;
// Distance at which rings fade to black, keeping the focus the bright origin.
const RING_REACH = 1.5;
const RING_SCALE_X = 0.95;
const RING_SCALE_Y = 1;
const RING_SCALE_Z = 0.05;
// Searchlight: two opposite rays through the rose center, sweeping the facade
// (X–Y) plane and blooming bright/white where they cross the rings.
const SEARCH_WIDTH = 0.35; // angular half-width of each beam, radians
const SEARCH_GAIN = 0.3; // lightness added at the beam core

// ---- rising bubbles (strand / topology) ------------------------------------
// Blobs slide UP each arch leg, treated as a near-vertical strand. Each arch
// splits into two legs at its apex; per pixel we precompute a strand id and a
// bottom→top parameter, then read an animated 1-D band of 4D noise along it.
// The strand id offsets the noise slice so neighbouring strands decorrelate.
const STRAND_ZONES = new Set<ZoneId>([
  'mainArches',
  'miniArches',
  'quadArches',
  'spires',
  'spirelets',
  'wash',
]);
// Noise features per strand length; higher = more, shorter blobs up the leg.
const STRAND_FREQ = 12;
// Upward slide of the band per phase unit.
const STRAND_SPEED = 0.04 * STRAND_FREQ;
// Slow morph of the band over time, independent of the upward slide.
const STRAND_TIME = 0.05;
// Spacing between strands' noise slices so neighbours decorrelate.
const STRAND_SEP = 12;
// Blob threshold + half-width of the black↔white ramp, in noise units. Higher
// threshold = sparser blobs; larger edge = softer, fuzzier blob boundaries.
const STRAND_THRESHOLD = 0.75;
const STRAND_EDGE = 0.18;
// Faint per-strand hue offset around the blue base, hue units.
const STRAND_TINT = 0.16;
// Gentle dimming of blobs as they reach the arch tip: amount, and the t at which
// the fade begins (1 = apex). Keeps the very tips from reading as hard dots.
const STRAND_TIP_FADE = 0.4;
const STRAND_TIP_START = 0.82;
// The pulse layer's LFO shaping, shared by the bubbles breathe and any beat flash.
// `ATTACK` is the fraction of the cycle spent rising; the period wobbles via noise
// while staying strictly recurring (the wobble's slope stays well under the base
// rate), so a running breath never reverses — it just breathes a little early/late.
const PULSE_ATTACK = 0.1;
const PULSE_WOBBLE = 0.15;
const PULSE_WOBBLE_RATE = 0.03;
const PULSE_SEED = 41;
// A black→white default ramp, so bare coverage screens as plain brightness.
const PULSE_RAMP_LOW: RampPoint = { h: 0, s: 0, l: 0 };
const PULSE_RAMP_HIGH: RampPoint = { h: 0, s: 0, l: 1 };
// The bubbles breathe instance: LFO period (phase units, ~seconds at speed 1) and
// its swell depth (peak coverage). It multiplies its ramp over the wash, so the
// ramp is white at rest (a no-op) and deepens to a cool blue at the breath's peak.
const BREATHE_PERIOD = 8;
const BREATHE_SWELL = 0.6;
const BREATHE_RAMP_LOW: RampPoint = { h: 0, s: 0, l: 1 };
const BREATHE_RAMP_HIGH: RampPoint = { h: 0.62, s: 0.6, l: 0.5 };
const BUBBLE_L = 0.95;
// The two-point HSL ramps each bubble layer colours through — the swappable
// "palette" unit. The wash runs dim→brighter blue over its noise coverage; the
// blobs run a blue edge→near-white core over their coverage; the height ramp
// multiplies white (floor) → a cool tint (crown) over the wash.
const WASH_RAMP_START: RampPoint = { h: 0.8, s: 0.7, l: 0.14 };
const WASH_RAMP_END: RampPoint = { h: 0.9, s: 0.55, l: 0.26 };
const BLOB_RAMP_START: RampPoint = { h: 0.66, s: 0.5, l: 0.5 };
const BLOB_RAMP_END: RampPoint = { h: 0.62, s: 0.1, l: 1 };
const HEIGHT_RAMP_BOTTOM: RampPoint = { h: 0, s: 0, l: 1 };
const HEIGHT_RAMP_TOP: RampPoint = { h: 0.62, s: 0.5, l: 0.85 };
const HEIGHT_RAMP_STRENGTH = 1;

// Stateless integer hash → [0,1), decorrelated between neighboring inputs.
const hashU = (a: number, b: number, c: number) => {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// One pulse per unit of p (p in [0,1)): a cosine bell time-warped so the rise is
// squeezed into the first `attack` of the cycle and the fall stretched across the
// rest — a smooth sine-like pulse with fast attack and slow release.
const asymPulse = (p: number, attack: number) => {
  const w = p < attack ? 0.5 * (p / attack) : 0.5 + 0.5 * ((p - attack) / (1 - attack));
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * w);
};

interface StrandField {
  // Per pixel: strand id (-1 = not on an animated strand), b + t*h is
  // the pixel's true position in space.
  id: Int32Array;
  t: Float32Array;
  b: Float32Array;
  h: Float32Array;
}

// Split animated segments into bottom→top strands. Arch segments carry both legs
// plus the apex in emit order (up leg A, over the apex, down leg B), so each arch
// yields two strands split at its highest pixel; single-vertical segments (spires)
// yield one. Segments are contiguous in emit order, so index order is strand order.
function strandField(pixels: PixelDescriptor[]): StrandField {
  const id = new Int32Array(pixels.length).fill(-1);
  const t = new Float32Array(pixels.length);
  const b = new Float32Array(pixels.length);
  const h = new Float32Array(pixels.length);

  const groups = new Map<string, number[]>();
  pixels.forEach((p, i) => {
    if (!STRAND_ZONES.has(p.zone)) return;
    const g = groups.get(p.segment);
    if (g) g.push(i);
    else groups.set(p.segment, [i]);
  });

  let nextId = 0;
  const walk = (idxs: number[]) => {
    const sid = nextId++;
    const last = idxs.length - 1;
    const y0 = pixels[idxs[0]].yn;
    const y1 = pixels[idxs[last]].yn;
    const zone = pixels[idxs[0]].zone;
    const span = Math.abs(y1 - y0) * (zone === 'spires' ? 0.2 : 1);
    const bottom = Math.min(y0, y1);
    const bottomUp = last === 0 || y0 <= y1;
    idxs.forEach((pi, k) => {
      id[pi] = sid;
      b[pi] = bottom;
      h[pi] = span;
      const f = last === 0 ? 0 : k / last;
      t[pi] = bottomUp ? f : 1 - f;
    });
  };

  for (const idxs of groups.values()) {
    let apex = 0;
    let apexYn = -Infinity;
    idxs.forEach((pi, k) => {
      if (pixels[pi].yn > apexYn) {
        apexYn = pixels[pi].yn;
        apex = k;
      }
    });
    walk(idxs.slice(0, apex + 1));
    if (apex + 1 <= idxs.length - 1) walk(idxs.slice(apex + 1));
  }

  return { id, t, b, h };
}

// Zones whose whole element lights as one solid ring; every other zone ripples
// per-pixel. An arch samples the ring field at its pixel nearest the focus.
const RING_SOLID_ZONES = new Set<ZoneId>(['mainArches']);
// const RING_SOLID_ZONES = new Set<ZoneId>(['mainArches', 'miniArches', 'quadArches']);

interface RingSample {
  r: number;
  fade: number;
  // Direction from the focus in the facade X–Y plane, radians, for the searchlight.
  angle: number;
}

// Per pixel, the anisotropic distance from the focus at which it reads the ring
// field, plus its precomputed edge fade. Solid-zone pixels borrow the distance of
// their segment's focus-nearest pixel so a whole arch resolves to one ring.
function ringField(pixels: PixelDescriptor[], focus: Vec3): RingSample[] {
  const [fx, fy, fz] = focus;

  const nearestOfSegment = new Map<string, number>();
  pixels.forEach((p, i) => {
    if (!RING_SOLID_ZONES.has(p.zone)) return;
    const d2 = (p.xn - fx) ** 2 + (p.yn - fy) ** 2 + (p.zn - fz) ** 2;
    const best = nearestOfSegment.get(p.segment);
    if (best === undefined) {
      nearestOfSegment.set(p.segment, i);
      return;
    }
    const b = pixels[best];
    if (d2 < (b.xn - fx) ** 2 + (b.yn - fy) ** 2 + (b.zn - fz) ** 2) {
      nearestOfSegment.set(p.segment, i);
    }
  });

  const ro = 0.5;
  const rk = 8;
  return pixels.map((p) => {
    const src = RING_SOLID_ZONES.has(p.zone) ? pixels[nearestOfSegment.get(p.segment)!] : p;
    const dx = (src.xn - fx) * RING_SCALE_X;
    const dy = (src.yn - fy) * RING_SCALE_Y;
    const dz = (src.zn - fz) * RING_SCALE_Z;
    const r = (Math.sqrt(Math.hypot(dx, dy, dz) * rk + ro) - Math.sqrt(ro)) / rk;
    return {
      r,
      fade: 1 - smoothstep(0, RING_REACH, r),
      angle: Math.atan2(p.yn - fy, (p.xn - fx) * 0.3),
    };
  });
}

// Warp a normalized position around `focus` so noise sampled at the result stays
// fine-grained near the focus and stretches (coarsens) with distance in every
// direction. The radial coordinate is compressed logarithmically; direction is
// preserved. As r → 0 the local frequency approaches NOISE_SCALE unchanged.
// `zoom` scales the sampled offset about the focus: < 1 pushes features outward.
function focusWarp(x: number, y: number, z: number, focus: Vec3, zoom: number): Vec3 {
  const [fx, fy, fz] = focus;
  const dx = x - fx;
  const dy = y - fy;
  const dz = z - fz;
  const r = Math.hypot(dx, dy, dz);
  const base =
    r < 1e-6
      ? NOISE_SCALE
      : (NOISE_SCALE * NOISE_FOCUS_FALLOFF * Math.log1p(r / NOISE_FOCUS_FALLOFF)) / r;
  const gain = base * zoom;
  return [fx * NOISE_SCALE + dx * gain, fy * NOISE_SCALE + dy * gain, fz * NOISE_SCALE + dz * gain];
}

// The pulse layer: an LFO breath (`rate` + `swell`) plus a `flash` coverage whose
// beat-kick gives a pure downbeat pulse. Each instance uses whichever it needs and
// leaves the rest at zero.
const PULSE_KNOBS: KnobSchema = {
  rate: {
    label: 'rate',
    type: 'rate',
    base: { min: 0, max: 1, step: 0.005 },
    kick: { min: -1, max: 1, step: 0.005 },
    default: { base: 0, kick: 0 },
  },
  swell: {
    label: 'swell',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: 0, kick: 0 },
  },
  flash: {
    label: 'flash',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 2, step: 0.01 },
    default: { base: 0, kick: 0 },
  },
};

const RAY_KNOBS: KnobSchema = {
  zoom: {
    label: 'scale',
    base: { min: 0.5, max: 8, step: 0.1 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: RAY_NOISE_SCALE, kick: -RAY_EXPAND * RAY_NOISE_SCALE },
  },
  rise: {
    label: 'scroll',
    type: 'rate',
    base: { min: -6, max: 6, step: 0.05 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: NOISE_RISE, kick: 0 },
  },
  time: {
    label: 'time',
    type: 'rate',
    base: { min: 0, max: 2, step: 0.01 },
    kick: { min: -2, max: 2, step: 0.01 },
    default: { base: NOISE_TIME, kick: 0 },
  },
  detailFloor: {
    label: 'detail',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: RAY_DETAIL_FLOOR, kick: 0 },
  },
  depth: {
    label: 'depth',
    base: { min: 0, max: 0.5, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.01 },
    default: { base: RAY_NOISE_DEPTH, kick: 0 },
  },
  thresholdAt: {
    label: 'threshold',
    base: { min: -1, max: 1, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.005 },
    default: { base: NOISE_THRESHOLD, kick: PULSE_DEPTH },
  },
  thresholdEdge: {
    label: 'edge',
    base: { min: 0.001, max: 0.5, step: 0.001 },
    kick: { min: -0.5, max: 0.5, step: 0.001 },
    default: { base: NOISE_EDGE, kick: 0 },
  },
};

const BLOB_KNOBS: KnobSchema = {
  freq: {
    label: 'density',
    base: { min: 2, max: 30, step: 0.5 },
    kick: { min: -10, max: 10, step: 0.5 },
    default: { base: STRAND_FREQ, kick: 0 },
  },
  speed: {
    label: 'rise',
    type: 'rate',
    base: { min: -3, max: 3, step: 0.01 },
    kick: { min: -3, max: 3, step: 0.01 },
    default: { base: STRAND_SPEED, kick: 0 },
  },
  time: {
    label: 'morph',
    type: 'rate',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: STRAND_TIME, kick: 0 },
  },
  threshold: {
    label: 'threshold',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -0.75, max: 0.75, step: 0.01 },
    default: { base: STRAND_THRESHOLD, kick: 0 },
  },
  edge: {
    label: 'edge',
    base: { min: 0.01, max: 0.5, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.01 },
    default: { base: STRAND_EDGE, kick: 0 },
  },
  tint: {
    label: 'tint',
    base: { min: 0, max: 0.5, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.01 },
    default: { base: STRAND_TINT, kick: 0 },
  },
  tipFade: {
    label: 'tip fade',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: STRAND_TIP_FADE, kick: 0 },
  },
  brightness: {
    label: 'brightness',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: BUBBLE_L, kick: 0 },
  },
};

// The focus-warped noise field shared by the bubbles wash and the standalone noise
// effect; height and brightness live in sibling layers. Defaults here are the
// wash's; the noise effect retunes them per instance in its stack.
const FIELD_KNOBS: KnobSchema = {
  zoom: {
    label: 'zoom',
    base: { min: 0.2, max: 3, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: 1, kick: 0 },
  },
  time: {
    label: 'time',
    type: 'rate',
    base: { min: 0, max: 2, step: 0.01 },
    kick: { min: -2, max: 2, step: 0.01 },
    default: { base: 0.1, kick: 0 },
  },
  thresholdAt: {
    label: 'threshold',
    base: { min: -1, max: 1, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.005 },
    default: { base: 0.1, kick: 0 },
  },
  thresholdEdge: {
    label: 'edge',
    base: { min: 0.001, max: 0.5, step: 0.001 },
    kick: { min: -0.5, max: 0.5, step: 0.001 },
    default: { base: 0.15, kick: 0 },
  },
};
const HEIGHT_KNOBS: KnobSchema = {
  strength: {
    label: 'height ramp',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: HEIGHT_RAMP_STRENGTH, kick: 0 },
  },
};

// A travelling crest along one coordinate: `scroll` integrates into the slide
// (sign picks direction) and `freq` sets the crest spacing. Colour rides the ramp
// over the crest, so each sweep instance just supplies a coordinate + palette.
const SWEEP_KNOBS: KnobSchema = {
  scroll: {
    label: 'scroll',
    type: 'rate',
    base: { min: -2, max: 2, step: 0.01 },
    kick: { min: -2, max: 2, step: 0.01 },
    default: { base: 0.25, kick: 0 },
  },
  freq: {
    label: 'density',
    base: { min: 0.25, max: 8, step: 0.05 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: 1, kick: 0 },
  },
};
// The vertical wave locks new-crest generation to tempo: `rate` is a beat ratio
// (num/den waves born per beat; sign flips travel direction, num 0 freezes),
// `density` sets crest spacing, `midpoint` skews where the trough sits between
// crests, `sharpness` tightens the crest.
const WAVEY_KNOBS: KnobSchema = {
  scroll: {
    label: 'wave rate',
    type: 'beatRatio',
    num: { min: -8, max: 8, step: 1 },
    den: { min: 1, max: 16, step: 1 },
    default: { num: 1, den: 2 },
  },
  freq: SWEEP_KNOBS.freq,
  midpoint: {
    label: 'midpoint',
    base: { min: 0.05, max: 0.95, step: 0.01 },
    kick: { min: -0.9, max: 0.9, step: 0.01 },
    default: { base: 0.5, kick: 0 },
  },
  sharpness: {
    label: 'sharpness',
    base: { min: 0.2, max: 8, step: 0.05 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: 2, kick: 0 },
  },
};
// Each sweep's two-point ramp runs a fixed hue dim → bright over the crest.
const LR_SWEEP_RAMP: Ramp = [
  { h: 0.08, s: 0.95, l: 0.03 },
  { h: 0.08, s: 0.95, l: 0.55 },
];
const RISE_RAMP: Ramp = [
  { h: 0.7, s: 0.9, l: 0.03 },
  { h: 0.7, s: 0.9, l: 0.55 },
];
const WAVEY_RAMP: Ramp = [
  { h: 0.09, s: 0.95, l: 0.03 },
  { h: 0.09, s: 0.95, l: 0.55 },
];
const WAVEY_MONO_RAMP: Ramp = [
  { h: 0, s: 0, l: 0.03 },
  { h: 0, s: 0, l: 0.55 },
];
const FB_SWEEP_RAMP: Ramp = [
  { h: 0.5, s: 0.9, l: 0.03 },
  { h: 0.5, s: 0.9, l: 0.55 },
];
const RADIAL_RAMP: Ramp = [
  { h: 0.87, s: 0.9, l: 0.03 },
  { h: 0.87, s: 0.9, l: 0.55 },
];

// Per-pixel sparkle: each pixel's random offset phase-shifts a cubed sine so
// neighbours brighten out of step, with a small intrinsic hue/sat jitter on top.
const TWINKLE_KNOBS: KnobSchema = {
  rate: {
    label: 'rate',
    type: 'rate',
    base: { min: 0, max: 6, step: 0.05 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: 2.5, kick: 0 },
  },
  power: {
    label: 'sharpness',
    base: { min: 1, max: 8, step: 0.1 },
    kick: { min: -4, max: 4, step: 0.1 },
    default: { base: 3, kick: 0 },
  },
  hueJitter: {
    label: 'hue jitter',
    base: { min: 0, max: 0.5, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.01 },
    default: { base: 0.06, kick: 0 },
  },
  satJitter: {
    label: 'sat jitter',
    base: { min: 0, max: 0.5, step: 0.01 },
    kick: { min: -0.5, max: 0.5, step: 0.01 },
    default: { base: 0.25, kick: 0 },
  },
};
const TWINKLE_RAMP: Ramp = [
  { h: 0.06, s: 0.75, l: 0.02 },
  { h: 0.06, s: 0.75, l: 0.57 },
];

// Concentric crests rippling out of the rose window: `freq` rings per unit
// distance, `scroll` their outward drift, `expand` the extra shove on each beat.
const RING_KNOBS: KnobSchema = {
  freq: {
    label: 'rings',
    base: { min: 4, max: 40, step: 0.5 },
    kick: { min: -20, max: 20, step: 0.5 },
    default: { base: RING_FREQ, kick: 0 },
  },
  scroll: {
    label: 'drift',
    type: 'rate',
    base: { min: -6, max: 6, step: 0.05 },
    kick: { min: -4, max: 4, step: 0.05 },
    default: { base: RING_SPEED, kick: 0 },
  },
  expand: {
    label: 'kick expand',
    base: { min: 0, max: 2, step: 0.02 },
    kick: { min: -2, max: 2, step: 0.02 },
    default: { base: RING_EXPAND, kick: 0 },
  },
};
const RING_RIPPLE_RAMP: Ramp = [
  { h: 0.37, s: 0.9, l: 0.04 },
  { h: 0.46, s: 0.9, l: 0.55 },
];

// A two-armed beam rotating through the facade plane and blooming where it
// crosses the rings: `spin` its beat-locked rate (num/den cycles per beat; the beam
// is two-armed so one cycle is a 180° half-turn; num 0 freezes it), `width` its
// half-angle, `gain` its brightness. Fixed downbeat phase offset keeps it clear of
// the crest.
const SEARCH_OFFSET = 0.55;
const SEARCH_KNOBS: KnobSchema = {
  spin: {
    label: 'beam rate',
    type: 'beatRatio',
    num: { min: -16, max: 16, step: 1 },
    den: { min: 1, max: 16, step: 1 },
    default: { num: 1, den: 1 },
  },
  width: {
    label: 'beam width',
    base: { min: 0.05, max: 1.5, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: SEARCH_WIDTH, kick: 0 },
  },
  gain: {
    label: 'beam gain',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: SEARCH_GAIN, kick: 0 },
  },
};
const SEARCH_RAMP: Ramp = [
  { h: 0.55, s: 0.5, l: 0 },
  { h: 0.5, s: 0.3, l: 0.95 },
];
// The beat brightness screened over the noise rays, replacing the old baked gain.
const RAY_FLASH_RAMP_LOW: RampPoint = { h: 0.03, s: 0.9, l: 0 };
const RAY_FLASH_RAMP_HIGH: RampPoint = { h: 0.05, s: 0.6, l: 0.9 };

// A focus-warped noise field soft-thresholded into coverage and coloured through
// its ramp — the opaque base of both the bubbles wash and the noise effect.
const noiseFieldKind = defineKind<EffectRuntime>({
  schema: FIELD_KNOBS,
  defaultRamp: [WASH_RAMP_START, WASH_RAMP_END],
  makePaint:
    ({ noise4D, focus }) =>
    ({ xn, yn, zn }, k, ramp) => {
      const [sx, sy, sz] = focusWarp(xn, yn, zn, focus, k.zoom);
      const amt = threshold(noise4D(sx, sy, sz, k.time), {
        at: k.thresholdAt,
        edge: k.thresholdEdge,
      });
      const [start, end] = ramp ?? [WASH_RAMP_START, WASH_RAMP_END];
      const [h, s, l] = ramp2(amt, start, end);
      return [h, s, l, 1];
    },
});

// A pulse screened through a ramp, driven by an LFO and/or a beat flash: `rate`
// clocks the LFO (0 = frozen), `swell` is its depth, and `flash` adds coverage
// directly — so `swell`+`rate` breathe, while `flash`'s own beat-kick alone gives
// a pure downbeat pulse with no LFO. The period wobbles via noise but never
// reverses, so a running breath stays strictly recurring. Coverage rides the ramp
// (a black→white default screens plain brightness; any palette tints the pulse).
const pulseKind = defineKind<EffectRuntime>({
  schema: PULSE_KNOBS,
  defaultRamp: [PULSE_RAMP_LOW, PULSE_RAMP_HIGH],
  makePaint:
    ({ noise4D }) =>
    ({ phase }, k, ramp) => {
      const lfoPhase = wrap(
        k.rate + PULSE_WOBBLE * noise4D(PULSE_SEED, phase * PULSE_WOBBLE_RATE, 0, 0),
      );
      const raw = k.swell * asymPulse(lfoPhase, PULSE_ATTACK) + k.flash;
      const amt = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      const [start, end] = ramp ?? [PULSE_RAMP_LOW, PULSE_RAMP_HIGH];
      const [h, s, l] = ramp2(amt, start, end);
      return [h, s, l, 1];
    },
});

// Colours the layers below by height: samples the ramp on a squared vertical curve
// (start at the floor, end at the crown) and multiplies it in, so a white start
// preserves their colour and a tinted end shades toward it. `strength` fades it.
const heightRampKind = defineKind<EffectRuntime>({
  schema: HEIGHT_KNOBS,
  defaultRamp: [HEIGHT_RAMP_BOTTOM, HEIGHT_RAMP_TOP],
  makePaint:
    () =>
    ({ yn }, k, ramp) => {
      const [start, end] = ramp ?? [HEIGHT_RAMP_BOTTOM, HEIGHT_RAMP_TOP];
      const [h, s, l] = ramp2(1 - verticalFade(yn), start, end);
      return [h, s, l, k.strength ?? 1];
    },
});

// The rising blobs: an animated 1-D band of noise read along each arch strand,
// soft-thresholded into coverage, tinted per strand and faded toward the tip.
const strandBlobsKind = defineKind<EffectRuntime>({
  schema: BLOB_KNOBS,
  defaultRamp: [BLOB_RAMP_START, BLOB_RAMP_END],
  makePaint:
    ({ noise4D, strands }) =>
    ({ index }, k, ramp) => {
      const sid = strands.id[index];
      if (sid < 0) return [0, 0, 0, 0];
      const t = strands.t[index];
      const h = strands.h[index];
      const along = Math.sqrt(0.2 * 0.2 + strands.b[index] + t * h) - 0.2;
      const v = h ? noise4D(sid * STRAND_SEP, along * k.freq - k.speed, k.time, 0) : 0;
      const tipFade = 1 - k.tipFade * smoothstep(STRAND_TIP_START, 1, t);
      const amt = smoothstep(k.threshold - k.edge, k.threshold + k.edge, v) * tipFade;
      const tint = (hashU(sid, 0, 1) - 0.5) * k.tint;
      const [start, end] = ramp ?? [BLOB_RAMP_START, BLOB_RAMP_END];
      const [rh, rs, rl] = ramp2(amt, start, end);
      return [rh + tint, rs, rl * k.brightness, amt];
    },
});

// The four sweeps differ only in the coordinate the crest travels along; lr runs
// the opposite way, so it negates the shared scroll.
const lrSweepKind = defineKind<EffectRuntime>({
  schema: SWEEP_KNOBS,
  defaultRamp: LR_SWEEP_RAMP,
  makePaint:
    () =>
    ({ xn }, k, ramp) => {
      const [start, end] = ramp ?? LR_SWEEP_RAMP;
      const [h, s, l] = ramp2(travelingBand(xn, k.freq, -k.scroll), start, end);
      return [h, s, l, 1];
    },
});

const riseKind = defineKind<EffectRuntime>({
  schema: SWEEP_KNOBS,
  defaultRamp: RISE_RAMP,
  makePaint:
    () =>
    ({ yn }, k, ramp) => {
      const [start, end] = ramp ?? RISE_RAMP;
      const [h, s, l] = ramp2(travelingBand(yn, k.freq, k.scroll), start, end);
      return [h, s, l, 1];
    },
});

// A crest climbing yn that accelerates as it rises: sqrt-warping the height
// compresses crest spacing toward the crown, so a steadily generated wave reads as
// speeding up. New waves are born at the tempo-locked `scroll` phase (num/den per
// beat); midpoint and sharpness shape the crest.
const waveYKind = defineKind<EffectRuntime>({
  schema: WAVEY_KNOBS,
  defaultRamp: WAVEY_RAMP,
  makePaint:
    () =>
    ({ yn }, k, ramp) => {
      const [start, end] = ramp ?? WAVEY_RAMP;
      const crest = skewedCrest(Math.sqrt(yn), k.freq, k.scroll, k.midpoint, k.sharpness);
      const [h, s, l] = ramp2(crest, start, end);
      return [h, s, l, 1];
    },
});

const fbSweepKind = defineKind<EffectRuntime>({
  schema: SWEEP_KNOBS,
  defaultRamp: FB_SWEEP_RAMP,
  makePaint:
    () =>
    ({ zn }, k, ramp) => {
      const [start, end] = ramp ?? FB_SWEEP_RAMP;
      const [h, s, l] = ramp2(travelingBand(zn, k.freq, k.scroll), start, end);
      return [h, s, l, 1];
    },
});

const radialKind = defineKind<EffectRuntime>({
  schema: SWEEP_KNOBS,
  defaultRamp: RADIAL_RAMP,
  makePaint:
    () =>
    ({ xn, zn }, k, ramp) => {
      const d = Math.hypot(xn - 0.5, zn - 0.5) * Math.SQRT2;
      const [start, end] = ramp ?? RADIAL_RAMP;
      const [h, s, l] = ramp2(travelingBand(d, k.freq, k.scroll), start, end);
      return [h, s, l, 1];
    },
});

const twinkleKind = defineKind<EffectRuntime>({
  schema: TWINKLE_KNOBS,
  defaultRamp: TWINKLE_RAMP,
  makePaint:
    () =>
    ({ twinkleOffset }, k, ramp) => {
      const b = Math.pow(0.5 + 0.5 * Math.sin(k.rate + twinkleOffset), k.power);
      const [start, end] = ramp ?? TWINKLE_RAMP;
      const [h, s, l] = ramp2(b, start, end);
      return [
        h + k.hueJitter * Math.sin(twinkleOffset * 5),
        s + k.satJitter * Math.cos(twinkleOffset * 3),
        l,
        1,
      ];
    },
});

// Thresholded simplex shafts fired radially from the focus, with a slow hue spin
// and a height hue tint baked into the ray look; the beat brightness lives in a
// sibling pulse layer.
const raysFieldKind = defineKind<EffectRuntime>({
  schema: RAY_KNOBS,
  defaultRamp: [RAY_RAMP_START, RAY_RAMP_END],
  makePaint: ({ noise4D, focus }) => {
    const [fx, fy, fz] = focus;
    return ({ xn, yn, zn }, k, ramp) => {
      const dx = Math.abs(xn - fx);
      const dy = yn - fy;
      const dz = (zn - fz) * k.depth;
      const r = Math.hypot(dx, dy, dz) || 1;
      const detail = k.detailFloor + (1 - k.detailFloor) * 0.5 * (1 + dy / r);
      const v = noise4D(
        (dx / r) * k.zoom * detail,
        (dy / r) * k.zoom - k.rise,
        (dz / r) * k.zoom,
        k.time,
      );
      const amt = threshold(v, { at: k.thresholdAt, edge: k.thresholdEdge });
      const [start, end] = ramp ?? [RAY_RAMP_START, RAY_RAMP_END];
      const [h, s, l] = ramp2(amt, start, end);
      return [h, s, l, 1];
    };
  },
});

// The rose-ring ripple: a crest travelling out along each pixel's precomputed
// focus distance, shoved outward on the beat, faded to black past the reach.
const ringsRippleKind = defineKind<EffectRuntime>({
  schema: RING_KNOBS,
  defaultRamp: RING_RIPPLE_RAMP,
  makePaint:
    ({ rings }) =>
    ({ index, phase, beat, bpm }, k, ramp) => {
      const { r, fade } = rings[index];
      const kick = beatSpike(beat, bpm, PULSE_DECAY);
      const crest = travelingBand(r, k.freq, k.scroll + k.expand * kick);
      const [start, end] = ramp ?? RING_RIPPLE_RAMP;
      const [h, s, l] = ramp2(crest, start, end);
      return [h + 0.08 * Math.sin(phase * 0.3), s, l * (1 + 0.7 * kick), fade];
    },
});

// The searchlight beam, blooming where the sweeping axis crosses the rings.
const searchlightKind = defineKind<EffectRuntime>({
  schema: SEARCH_KNOBS,
  defaultRamp: SEARCH_RAMP,
  makePaint:
    ({ rings }) =>
    ({ index, beat, bpm }, k, ramp) => {
      const { angle } = rings[index];
      const kick = beatSpike(beat, bpm, PULSE_DECAY);
      const spin = k.spin * Math.PI;
      const beam = 1 - smoothstep(0, k.width, axisGap(angle - (spin - SEARCH_OFFSET * Math.PI)));
      const [start, end] = ramp ?? SEARCH_RAMP;
      const [h, s, l] = ramp2(beam, start, end);
      return [h, s, l, (k.gain + 0.15 * kick) * beam];
    },
});

// The building-block palette a stack references by id. Every kind stays available
// to the layer editor even if no default look uses it; the id is the wire/persist
// contract, so renaming a key is a migration.
export const LAYER_KINDS = {
  noiseField: noiseFieldKind,
  pulse: pulseKind,
  heightRamp: heightRampKind,
  strandBlobs: strandBlobsKind,
  lrSweep: lrSweepKind,
  rise: riseKind,
  waveY: waveYKind,
  fbSweep: fbSweepKind,
  radial: radialKind,
  twinkle: twinkleKind,
  raysField: raysFieldKind,
  ringsRipple: ringsRippleKind,
  searchlight: searchlightKind,
} as const satisfies Record<string, LayerKind<EffectRuntime>>;
export type LayerKindId = keyof typeof LAYER_KINDS;
export const LAYER_KIND_IDS = Object.keys(LAYER_KINDS) as LayerKindId[];

// Breathe and height sit under the blobs, so they colour only the wash while the
// rising blobs stay pure on top.
const RISING_BUBBLES: LayerDef[] = [
  slot('wash', 'over', 'noiseField', [WASH_RAMP_START, WASH_RAMP_END]),
  slot('breathe', 'multiply', 'pulse', [BREATHE_RAMP_LOW, BREATHE_RAMP_HIGH], {
    rate: { base: 1 / BREATHE_PERIOD },
    swell: { base: BREATHE_SWELL },
  }),
  slot('height', 'multiply', 'heightRamp', [HEIGHT_RAMP_BOTTOM, HEIGHT_RAMP_TOP]),
  slot('blobs', 'over', 'strandBlobs', [BLOB_RAMP_START, BLOB_RAMP_END]),
];

// The standalone noise effect, decomposed like the bubbles: the shared field base
// retuned to its own defaults, a height tint multiplied over it, and a beat
// brightness screened on top.
const NOISE_BLOBS: LayerDef[] = [
  slot('field', 'over', 'noiseField', [NOISE_RAMP_START, NOISE_RAMP_END], {
    zoom: { kick: -PULSE_EXPAND },
    time: { base: NOISE_TIME },
    thresholdAt: { base: NOISE_THRESHOLD, kick: PULSE_DEPTH },
    thresholdEdge: { base: NOISE_EDGE },
  }),
  slot('height', 'multiply', 'heightRamp', [NOISE_HEIGHT_RAMP_FLOOR, NOISE_HEIGHT_RAMP_CROWN]),
  slot('bright', 'multiply', 'pulse', [NOISE_FLASH_RAMP_LOW, NOISE_FLASH_RAMP_HIGH], {
    flash: { kick: NOISE_KICK_LIGHT },
  }),
];

const WAVEY: LayerDef[] = [
  slot('sweep', 'over', 'waveY', WAVEY_RAMP),
  slot('sweep2', 'add', 'waveY', WAVEY_MONO_RAMP),
];

// The rays field plus its beat-brightness flash, screened on so the downbeat
// blooms rather than tints.
const NOISE_RAYS: LayerDef[] = [
  slot('rays', 'over', 'raysField', [RAY_RAMP_START, RAY_RAMP_END]),
  slot('height', 'multiply', 'heightRamp', [NOISE_HEIGHT_RAMP_FLOOR, NOISE_HEIGHT_RAMP_CROWN]),
  slot('bright', 'screen', 'pulse', [RAY_FLASH_RAMP_LOW, RAY_FLASH_RAMP_HIGH], {
    flash: { kick: RAY_KICK_LIGHT },
  }),
];

// Ripple base with the searchlight bloomed on top.
const RINGS: LayerDef[] = [
  slot('rings', 'over', 'ringsRipple', RING_RIPPLE_RAMP),
  slot('beam', 'screen', 'searchlight', SEARCH_RAMP),
];

// The curated stacks that seed the slot bank on first run. Each is a full look —
// the layer topology plus its seed ramps and knob defaults live in the LayerDef[].
export const DEFAULT_LOOKS: { name: string; layers: LayerDef[] }[] = [
  { name: 'noise blobs', layers: NOISE_BLOBS },
  { name: 'noise rays', layers: NOISE_RAYS },
  { name: 'rose rings', layers: RINGS },
  { name: 'rising bubbles', layers: RISING_BUBBLES },
  { name: 'waveY', layers: WAVEY },
];

for (const look of DEFAULT_LOOKS)
  for (const def of look.layers)
    if (!(def.kind in LAYER_KINDS)) throw new Error(`unknown layer kind: ${def.kind}`);

// Resolve everything a stack's paint closes over, once per engine build.
export function createEffectRuntime(
  { noise4D }: DemoEffectContext,
  pixels: PixelDescriptor[],
  focus: Vec3,
): EffectRuntime {
  return { noise4D, focus, strands: strandField(pixels), rings: ringField(pixels, focus) };
}
