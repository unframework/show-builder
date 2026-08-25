import { beatSpike } from './stages';

// A tunable scalar plus a beat-kick modulation amount. Each frame it resolves to
// `base + kick * kickCurve`, where kickCurve spikes to 1 on the downbeat and
// decays to 0 — so `kick` is how far (and which way) the beat pushes the value.
export interface KnobValue {
  base: number;
  kick: number;
}

export interface Range {
  min: number;
  max: number;
  step: number;
}

// 'rate' knobs are integrated into a running phase and expose that phase (not the
// rate) to the effect, so changing the rate never jumps the phase; default 'value'.
export type KnobType = 'value' | 'rate';

export interface KnobDef {
  label: string;
  type?: KnobType;
  base: Range;
  kick: Range;
  default: KnobValue;
}

export type KnobSchema = Record<string, KnobDef>;
export type KnobValues = Record<string, KnobValue>;
export type ResolvedKnobs = Record<string, number>;

// Time constant (seconds) of the beat-kick envelope every knob's `kick` rides.
const KICK_DECAY = 0.07;
export const kickCurve = (beat: number, bpm: number) => beatSpike(beat, bpm, KICK_DECAY);

export function defaultKnobValues(schema: KnobSchema): KnobValues {
  const values: KnobValues = {};
  for (const key in schema) values[key] = { ...schema[key].default };
  return values;
}

// Fold each knob's base + beat-kick amount into a plain scalar for this frame.
export function resolveKnobs(schema: KnobSchema, values: KnobValues, kick: number): ResolvedKnobs {
  const resolved: ResolvedKnobs = {};
  for (const key in schema) {
    const v = values[key] ?? schema[key].default;
    resolved[key] = v.base + v.kick * kick;
  }
  return resolved;
}
