import { createNoise4D, type NoiseFunction4D } from 'simplex-noise';
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

// HSL for a pixel given its normalized position and the animation phase.
// A `hsl`-less effect ("zone") paints each pixel its fixed zone color instead.
export interface DemoEffect {
  id: DemoEffectId;
  label: string;
  hsl?: (input: EffectInput) => [number, number, number];
}

// stable stuff reused across hot-reloads
export interface DemoEffectContext {
  noise4D: NoiseFunction4D;
}

export function createDemoEffectContext(): DemoEffectContext {
  return { noise4D: createNoise4D() };
}

const bell = (p: number) => Math.pow(Math.max(0, Math.cos(p * Math.PI)), 2);
const wrap = (x: number) => ((x % 1) + 1) % 1;
const band = (p: number) => 0.03 + 0.52 * bell(p);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// A 1→0 spike on every beat: instant attack on the kick, exponential decay with
// time constant `decay` (seconds). `beat` is the beat clock in fractional beats.
const beatSpike = (beat: number, bpm: number, decay: number) => {
  const sinceBeatSec = (beat - Math.floor(beat)) * (60 / bpm);
  return Math.exp(-sinceBeatSec / decay);
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
// Feature count across the unit sphere the rays pierce. Smaller = fewer, broader shafts.
const RAY_NOISE_SCALE = 3;
const RAY_NOISE_DEPTH = 0.08; // zero means purely ignoring cathedral depth
const RAY_EXPAND = 0.2;
// Horizontal detail multiplier at the floor, ramping to full (1) at the top:
// compresses the sampled X-coord low down so the bottom reads coarser than the crown.
const RAY_DETAIL_FLOOR = 0.05;

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
] as const;

export type DemoEffectId = (typeof DEMO_EFFECTS)[number]['id'];

export function createDemoEffects(
  { noise4D }: DemoEffectContext,
  pixels: PixelDescriptor[],
  focus: Vec3,
): Record<DemoEffectId, DemoEffect['hsl'] | undefined> {
  const [fx, fy, fz] = focus;
  const rings = ringField(pixels, focus);
  return {
    zone: undefined,
    'lr-sweep': ({ xn, phase }) => [0.08, 0.95, band(wrap(xn + phase * 0.25))],
    rise: ({ yn, phase }) => [0.7, 0.9, band(wrap(yn - phase * 0.25))],
    'fb-sweep': ({ zn, phase }) => [0.5, 0.9, band(wrap(zn - phase * 0.25))],
    radial: ({ xn, zn, phase }) => {
      const d = Math.hypot(xn - 0.5, zn - 0.5) * Math.SQRT2;
      return [0.87, 0.9, band(wrap(d - phase * 0.25))];
    },
    twinkle: ({ phase, twinkleOffset }) => {
      const b = Math.pow(0.5 + 0.5 * Math.sin(phase * 2.5 + twinkleOffset), 3);
      return [
        0.06 + 0.06 * Math.sin(twinkleOffset * 5),
        0.75 + 0.25 * Math.cos(twinkleOffset * 3),
        0.02 + 0.55 * b,
      ];
    },
    noise: ({ xn, yn, zn, phase, beat, bpm }) => {
      const kick = beatSpike(beat, bpm, PULSE_DECAY);
      const [sx, sy, sz] = focusWarp(xn, yn, zn, focus, 1 - PULSE_EXPAND * kick);
      const v = noise4D(sx, sy, sz, phase * NOISE_TIME);
      const amt = smoothstep(
        NOISE_THRESHOLD - NOISE_EDGE,
        NOISE_THRESHOLD + NOISE_EDGE,
        v - PULSE_DEPTH * kick,
      );
      const yoff = (1 - yn) * (1 - yn);
      return [-0.2 + 0.25 * amt - yoff * 0.2, 1, (0.5 + 0.1 * kick) * amt];
    },
    'noise-rays': ({ xn, yn, zn, phase, beat, bpm }) => {
      const dx = Math.abs(xn - fx);
      const dy = yn - fy;
      const dz = (zn - fz) * RAY_NOISE_DEPTH;
      const r = Math.hypot(dx, dy, dz) || 1;
      const kick = beatSpike(beat, bpm, PULSE_DECAY);
      const zoom = (1 - RAY_EXPAND * kick) * RAY_NOISE_SCALE;
      const detail = RAY_DETAIL_FLOOR + (1 - RAY_DETAIL_FLOOR) * 0.5 * (1 + dy / r);
      const v = noise4D(
        (dx / r) * zoom * detail,
        (dy / r) * zoom - phase * NOISE_RISE,
        (dz / r) * zoom,
        phase * NOISE_TIME,
      );
      const amt = smoothstep(
        NOISE_THRESHOLD - NOISE_EDGE,
        NOISE_THRESHOLD + NOISE_EDGE,
        v - PULSE_DEPTH * kick,
      );
      const yoff = (1 - yn) * (1 - yn);
      return [
        Math.sin(phase * 0.5) * 0.2 + -0.2 + 0.25 * amt - yoff * 0.2,
        1,
        (0.5 + 0.3 * kick) * amt,
      ];
    },
    rings: ({ index, phase, beat, bpm }) => {
      const { r, fade, angle } = rings[index];
      const kick = beatSpike(beat, bpm, PULSE_DECAY);
      const crest = bell(wrap(r * RING_FREQ - phase * RING_SPEED - kick * RING_EXPAND));

      const beam = 1 - smoothstep(0, SEARCH_WIDTH, axisGap(angle - (beat - 0.55) * SEARCH_SPEED));

      return [
        0.37 + 0.09 * crest + 0.08 * Math.sin(phase * 0.3) + 0.1 * beam,
        0.9 - 0.2 * beam,
        (0.04 + (0.5 + 0.35 * kick) * crest) * fade + (SEARCH_GAIN + 0.15 * kick) * beam, // TODO: try negative!
      ];
    },
  };
}
