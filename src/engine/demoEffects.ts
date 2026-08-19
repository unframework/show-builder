export type DemoEffectId = 'zone' | 'lr-sweep' | 'rise' | 'fb-sweep' | 'radial' | 'twinkle';

export interface EffectInput {
  xn: number;
  yn: number;
  zn: number;
  phase: number;
  twinkleOffset: number;
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
];

export const DEMO_EFFECT_BY_ID = new Map(DEMO_EFFECTS.map((e) => [e.id, e]));
