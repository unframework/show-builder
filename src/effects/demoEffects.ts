import { createNoise4D } from 'simplex-noise';
import type { Vec3 } from '../scene/coords';

export type DemoEffectId =
  'zone' | 'lr-sweep' | 'rise' | 'fb-sweep' | 'radial' | 'twinkle' | 'noise' | 'noise-rays';

export interface EffectInput {
  xn: number;
  yn: number;
  zn: number;
  phase: number;
  // Fractional beats since the last cue; integer crossings are downbeats.
  beat: number;
  bpm: number;
  twinkleOffset: number;
  // Normalized position of the rose window: a focal point some effects warp around.
  focus: Vec3;
}

// HSL for a pixel given its normalized position and the animation phase.
// A `hsl`-less effect ("zone") paints each pixel its fixed zone color instead.
export interface DemoEffect {
  id: DemoEffectId;
  label: string;
  hsl?: (input: EffectInput) => [number, number, number];
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

const noise4D = createNoise4D();
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

export const DEMO_EFFECTS: DemoEffect[] = [
  { id: 'zone', label: 'zone colors' },
  {
    id: 'lr-sweep',
    label: 'left → right',
    hsl: ({ xn, phase }) => [0.08, 0.95, band(wrap(xn + phase * 0.25))],
  },
  {
    id: 'rise',
    label: 'rise',
    hsl: ({ yn, phase }) => [0.7, 0.9, band(wrap(yn - phase * 0.25))],
  },
  {
    id: 'fb-sweep',
    label: 'front → back',
    hsl: ({ zn, phase }) => [0.5, 0.9, band(wrap(zn - phase * 0.25))],
  },
  {
    id: 'radial',
    label: 'radial pulse',
    hsl: ({ xn, zn, phase }) => {
      const d = Math.hypot(xn - 0.5, zn - 0.5) * Math.SQRT2;
      return [0.87, 0.9, band(wrap(d - phase * 0.25))];
    },
  },
  {
    id: 'twinkle',
    label: 'twinkle',
    hsl: ({ phase, twinkleOffset }) => {
      const b = Math.pow(0.5 + 0.5 * Math.sin(phase * 2.5 + twinkleOffset), 3);
      return [
        0.06 + 0.06 * Math.sin(twinkleOffset * 5),
        0.75 + 0.25 * Math.cos(twinkleOffset * 3),
        0.02 + 0.55 * b,
      ];
    },
  },
  {
    id: 'noise',
    label: 'noise blobs',
    hsl: ({ xn, yn, zn, phase, beat, bpm, focus }) => {
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
  },
  {
    id: 'noise-rays',
    label: 'noise rays',
    hsl: ({ xn, yn, zn, phase, beat, bpm, focus }) => {
      const [fx, fy, fz] = focus;
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
  },
];

export const DEMO_EFFECT_BY_ID = new Map(DEMO_EFFECTS.map((e) => [e.id, e]));
