import { createNoise4D, type NoiseFunction4D } from 'simplex-noise';
import {
  buildLayers,
  defineKind,
  slot,
  topologyRamps,
  topologySchemas,
  type Layer,
  type LayerSlot,
} from './layers';
import {
  beatSpike,
  ramp2,
  smoothstep,
  threshold,
  verticalFade,
  type Ramp,
  type RampPoint,
} from './stages';
import type { KnobSchema, ResolvedKnobs } from './knobs';
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

type Paint = (input: EffectInput, knobs: ResolvedKnobs) => [number, number, number];

// The common case: one fully opaque layer that owns the whole pixel. An effect
// with no layers ("zone") paints each pixel its fixed zone color instead.
const solid = (name: string, paint: Paint, ramp?: Ramp): Layer => ({
  name,
  blend: 'over',
  ramp,
  paint: (input, knobs) => {
    const [h, s, l] = paint(input, knobs);
    return [h, s, l, 1];
  },
});

// stable stuff reused across hot-reloads
export interface DemoEffectContext {
  noise4D: NoiseFunction4D;
}

export function createDemoEffectContext(): DemoEffectContext {
  return { noise4D: createNoise4D() };
}

// Everything a layer kind's paint closes over, resolved once per engine build.
interface EffectRuntime {
  noise4D: NoiseFunction4D;
  focus: Vec3;
  strands: StrandField;
}

const bell = (p: number) => Math.pow(Math.max(0, Math.cos(p * Math.PI)), 2);
const wrap = (x: number) => ((x % 1) + 1) % 1;
const band = (p: number) => 0.03 + 0.52 * bell(p);
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
const NOISE_KICK_LIGHT = 0.2;
// Feature count across the unit sphere the rays pierce. Smaller = fewer, broader shafts.
const RAY_NOISE_SCALE = 3;
const RAY_NOISE_DEPTH = 0.08; // zero means purely ignoring cathedral depth
const RAY_EXPAND = 0.2;
// Horizontal detail multiplier at the floor, ramping to full (1) at the top:
// compresses the sampled X-coord low down so the bottom reads coarser than the crown.
const RAY_DETAIL_FLOOR = 0.05;
// Rays palette + modulation: a slow hue oscillation, a height hue tint, and the
// beat's lightness gain layered over the color ramp.
const RAY_HUE_SPIN_RATE = 0.5;
const RAY_HUE_SPIN = 0.2;
const RAY_HEIGHT_HUE = -0.2;
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
const SEARCH_SPEED = Math.PI; // axis rotation, radians per beat (π = one half-turn per beat)
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
// Slow global brightness pulse screened over the wash. BREATHE_PERIOD is in phase
// units (~seconds at speed 1). The period wobbles via noise while staying strictly
// recurring: the wobble's slope stays well under the base rate, so the pulse
// never reverses — it just breathes a little early/late.
const BREATHE_PERIOD = 8;
// Brightness added.
const BREATHE_DEPTH = 1;
// Attack fraction of the cycle: small = snappy rise, long slow release.
const BREATHE_ATTACK = 0.1;
// Period wobble: ± cycles of phase jitter, and how fast that jitter itself drifts.
const BREATHE_WOBBLE = 0.15;
const BREATHE_WOBBLE_RATE = 0.03;
const BREATHE_SEED = 41;
// Peak screen coverage of the pulse at full depth.
const BREATHE_GAIN = 0.6;
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

// Static id + label, safe to import anywhere (no context, no noise): the picker
// and the control-message enum read these without instantiating an engine. This
// list is the source of truth for DemoEffectId.
export const DEMO_EFFECTS = [
  { id: 'zone', label: 'zone colors' },
  { id: 'lr-sweep', label: 'left → right' },
  { id: 'rise', label: 'rise' },
  { id: 'fb-sweep', label: 'front → back' },
  { id: 'radial', label: 'radial pulse' },
  { id: 'twinkle', label: 'twinkle' },
  { id: 'noise', label: 'noise blobs' },
  { id: 'noise-rays', label: 'noise rays' },
  { id: 'rings', label: 'rose rings' },
  { id: 'rising-bubbles', label: 'rising bubbles' },
] as const;

export type DemoEffectId = (typeof DEMO_EFFECTS)[number]['id'];

// A beat-kicked brightness screened over a layer below. `gain` reads as a
// lightness multiplier (1 = unchanged); the layer screens white by gain − 1.
const BRIGHTNESS_KNOBS: KnobSchema = {
  gain: {
    label: 'brightness',
    base: { min: 1, max: 2, step: 0.01 },
    kick: { min: -1, max: 2, step: 0.01 },
    default: { base: 1, kick: NOISE_KICK_LIGHT },
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
  lightGain: {
    label: 'brightness',
    base: { min: 0, max: 2, step: 0.01 },
    kick: { min: -1, max: 2, step: 0.01 },
    default: { base: 1, kick: RAY_KICK_LIGHT },
  },
  heightHue: {
    label: 'height hue',
    base: { min: -1, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: RAY_HEIGHT_HUE, kick: 0 },
  },
  hueSpin: {
    label: 'hue spin',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: RAY_HUE_SPIN, kick: 0 },
  },
};

const BUBBLE_KNOBS: KnobSchema = {
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
  breathe: {
    label: 'breathe',
    type: 'rate',
    base: { min: 0, max: 1, step: 0.005 },
    kick: { min: -1, max: 1, step: 0.005 },
    default: { base: 1 / BREATHE_PERIOD, kick: 0 },
  },
  breatheDepth: {
    label: 'breathe depth',
    base: { min: 0, max: 2, step: 0.01 },
    kick: { min: -2, max: 2, step: 0.01 },
    default: { base: BREATHE_DEPTH, kick: 0 },
  },
  brightness: {
    label: 'brightness',
    base: { min: 0, max: 1, step: 0.01 },
    kick: { min: -1, max: 1, step: 0.01 },
    default: { base: BUBBLE_L, kick: 0 },
  },
};

// Rising-bubbles is a stack, so its knobs split by layer: the pulse controls drive
// the breathe layer, the strength the height ramp, the rest the strand layer.
const { breathe, breatheDepth, ...BLOB_KNOBS } = BUBBLE_KNOBS;
const BREATHE_KNOBS: KnobSchema = { breathe, breatheDepth };
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

// A focus-warped noise field soft-thresholded into coverage and coloured through
// its ramp — the opaque base of both the bubbles wash and the noise effect.
const noiseFieldKind = defineKind<EffectRuntime>({
  schema: FIELD_KNOBS,
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

// A beat-kicked brightness: screens white over the layers below by `gain` − 1, so
// gain 1 is a no-op and the kick lifts the whole field on the downbeat.
const brightnessKind = defineKind<EffectRuntime>({
  schema: BRIGHTNESS_KNOBS,
  makePaint: () => (_input, k) => {
    const a = k.gain - 1;
    return [0, 0, 1, a < 0 ? 0 : a > 1 ? 1 : a];
  },
});

// A slow global brightness pulse, screened over the wash. Period wobbles via noise
// while staying strictly recurring, so the pulse never reverses — just breathes
// a little early/late.
const breatheKind = defineKind<EffectRuntime>({
  schema: BREATHE_KNOBS,
  makePaint:
    ({ noise4D }) =>
    ({ phase }, k) => {
      const breathePhase = wrap(
        k.breathe + BREATHE_WOBBLE * noise4D(BREATHE_SEED, phase * BREATHE_WOBBLE_RATE, 0, 0),
      );
      const amt = k.breatheDepth * asymPulse(breathePhase, BREATHE_ATTACK) * BREATHE_GAIN;
      return [0, 0, 1, amt < 0 ? 0 : amt > 1 ? 1 : amt];
    },
});

// Colours the layers below by height: samples the ramp on a squared vertical curve
// (start at the floor, end at the crown) and multiplies it in, so a white start
// preserves their colour and a tinted end shades toward it. `strength` fades it.
const heightRampKind = defineKind<EffectRuntime>({
  schema: HEIGHT_KNOBS,
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

// Breathe and height sit under the blobs, so they colour only the wash while the
// rising blobs stay pure on top.
const RISING_BUBBLES: LayerSlot<EffectRuntime>[] = [
  slot('wash', 'over', noiseFieldKind, [WASH_RAMP_START, WASH_RAMP_END]),
  slot('breathe', 'screen', breatheKind),
  slot('height', 'multiply', heightRampKind, [HEIGHT_RAMP_BOTTOM, HEIGHT_RAMP_TOP]),
  slot('blobs', 'over', strandBlobsKind, [BLOB_RAMP_START, BLOB_RAMP_END]),
];

// The standalone noise effect, decomposed like the bubbles: the shared field base
// retuned to its own defaults, a height tint multiplied over it, and a beat
// brightness screened on top.
const NOISE_BLOBS: LayerSlot<EffectRuntime>[] = [
  slot('field', 'over', noiseFieldKind, [NOISE_RAMP_START, NOISE_RAMP_END], {
    zoom: { kick: -PULSE_EXPAND },
    time: { base: NOISE_TIME },
    thresholdAt: { base: NOISE_THRESHOLD, kick: PULSE_DEPTH },
    thresholdEdge: { base: NOISE_EDGE },
  }),
  slot('height', 'multiply', heightRampKind, [NOISE_HEIGHT_RAMP_FLOOR, NOISE_HEIGHT_RAMP_CROWN]),
  slot('bright', 'screen', brightnessKind),
];

// Per-effect tunable knobs (base value + beat-kick amount), surfaced in the UI and
// persisted per effect, keyed effect → layer → knob. Effects absent here have no
// knobs. noise-rays is still single-layer, named to match its built layer.
export const EFFECT_KNOBS: Partial<Record<DemoEffectId, Record<string, KnobSchema>>> = {
  noise: topologySchemas(NOISE_BLOBS),
  'noise-rays': { rays: RAY_KNOBS },
  'rising-bubbles': topologySchemas(RISING_BUBBLES),
};

// Seed ramps for layers that own their ramp as runtime state; other effects keep
// their ramp baked into paint and expose it only for display.
export const EFFECT_RAMPS: Partial<Record<DemoEffectId, Record<string, Ramp>>> = {
  noise: topologyRamps(NOISE_BLOBS),
  'rising-bubbles': topologyRamps(RISING_BUBBLES),
};

export function createDemoEffects(
  { noise4D }: DemoEffectContext,
  pixels: PixelDescriptor[],
  focus: Vec3,
): Record<DemoEffectId, Layer[] | undefined> {
  const [fx, fy, fz] = focus;
  const rings = ringField(pixels, focus);
  const strands = strandField(pixels);
  return {
    zone: undefined,
    'lr-sweep': [solid('sweep', ({ xn, phase }) => [0.08, 0.95, band(wrap(xn + phase * 0.25))])],
    rise: [solid('rise', ({ yn, phase }) => [0.7, 0.9, band(wrap(yn - phase * 0.25))])],
    'fb-sweep': [solid('sweep', ({ zn, phase }) => [0.5, 0.9, band(wrap(zn - phase * 0.25))])],
    radial: [
      solid('pulse', ({ xn, zn, phase }) => {
        const d = Math.hypot(xn - 0.5, zn - 0.5) * Math.SQRT2;
        return [0.87, 0.9, band(wrap(d - phase * 0.25))];
      }),
    ],
    twinkle: [
      solid('twinkle', ({ phase, twinkleOffset }) => {
        const b = Math.pow(0.5 + 0.5 * Math.sin(phase * 2.5 + twinkleOffset), 3);
        return [
          0.06 + 0.06 * Math.sin(twinkleOffset * 5),
          0.75 + 0.25 * Math.cos(twinkleOffset * 3),
          0.02 + 0.55 * b,
        ];
      }),
    ],
    noise: buildLayers(NOISE_BLOBS, { noise4D, focus, strands }),
    'noise-rays': [
      solid(
        'rays',
        ({ xn, yn, zn, phase }, k) => {
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
          const [h, s, l] = ramp2(amt, RAY_RAMP_START, RAY_RAMP_END);
          return [
            h + k.hueSpin * Math.sin(phase * RAY_HUE_SPIN_RATE) + k.heightHue * verticalFade(yn),
            s,
            l * k.lightGain,
          ];
        },
        [RAY_RAMP_START, RAY_RAMP_END],
      ),
    ],
    rings: [
      solid('rings', ({ index, phase, beat, bpm }) => {
        const { r, fade, angle } = rings[index];
        const kick = beatSpike(beat, bpm, PULSE_DECAY);
        const crest = bell(wrap(r * RING_FREQ - phase * RING_SPEED - kick * RING_EXPAND));

        const beam = 1 - smoothstep(0, SEARCH_WIDTH, axisGap(angle - (beat - 0.55) * SEARCH_SPEED));

        return [
          0.37 + 0.09 * crest + 0.08 * Math.sin(phase * 0.3) + 0.1 * beam,
          0.9 - 0.2 * beam,
          (0.04 + (0.5 + 0.35 * kick) * crest) * fade + (SEARCH_GAIN + 0.15 * kick) * beam, // TODO: try negative!
        ];
      }),
    ],
    'rising-bubbles': buildLayers(RISING_BUBBLES, { noise4D, focus, strands }),
  };
}
