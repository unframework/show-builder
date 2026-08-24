// Composable per-pixel pipeline stages shared across effects. Pure and
// framework-agnostic: a source (e.g. simplex noise) feeds a chain of these to
// shape and colour a scalar field.

// Smooth 0→1 ramp between two edges (Hermite); flat outside [e0, e1].
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// A 1→0 spike on every beat: instant attack on the kick, exponential decay with
// time constant `decay` (seconds). `beat` is the beat clock in fractional beats.
export const beatSpike = (beat: number, bpm: number, decay: number) => {
  const sinceBeatSec = (beat - Math.floor(beat)) * (60 / bpm);
  return Math.exp(-sinceBeatSec / decay);
};

// Vertical emphasis: 0 at the crown (yn=1), 1 at the floor (yn=0).
export const verticalFade = (yn: number) => (1 - yn) * (1 - yn);

export interface ThresholdParams {
  at: number;
  // Half-width of the soft ramp around `at`; 0 = hard edge.
  edge: number;
}
// Blob mask: soft-threshold a scalar field into 0..1 around `at`.
export const threshold = (x: number, { at, edge }: ThresholdParams) =>
  smoothstep(at - edge, at + edge, x);

export interface RampPoint {
  h: number;
  s: number;
  l: number;
}
// Two-point HSL ramp: map t∈[0,1] from `start` to `end`.
export const ramp2 = (t: number, start: RampPoint, end: RampPoint): [number, number, number] => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    start.h + (end.h - start.h) * u,
    start.s + (end.s - start.s) * u,
    start.l + (end.l - start.l) * u,
  ];
};
