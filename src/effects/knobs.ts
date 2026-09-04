import { beatSpike } from './stages';

// A tunable scalar plus a beat-kick modulation amount. Each frame it resolves to
// `base + kick * kickCurve`, where kickCurve spikes to 1 on the downbeat and
// decays to 0 — so `kick` is how far (and which way) the beat pushes the value.
export interface ScalarKnobValue {
  base: number;
  kick: number;
}

// A beat-locked rate as an integer fraction: num/den cycles per beat. Resolves to
// an accumulating phase in cycles, integrated against the beat clock (tempo-locked).
export interface BeatRatioValue {
  num: number;
  den: number;
}

export type KnobValue = ScalarKnobValue | BeatRatioValue;

export interface Range {
  min: number;
  max: number;
  step: number;
}

// 'rate' knobs integrate into a per-second phase (scaled by speed); 'beatRatio'
// knobs integrate into a per-beat phase (tempo-locked). Both expose the phase, not
// the rate, so changing the rate never jumps the phase. Default 'value'.
export type KnobType = 'value' | 'rate' | 'beatRatio';

interface KnobDefBase {
  label: string;
}

export interface ScalarKnobDef extends KnobDefBase {
  type?: 'value' | 'rate';
  base: Range;
  kick: Range;
  default: ScalarKnobValue;
}

export interface BeatRatioKnobDef extends KnobDefBase {
  type: 'beatRatio';
  num: Range;
  den: Range;
  default: BeatRatioValue;
}

export type KnobDef = ScalarKnobDef | BeatRatioKnobDef;

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

// Fold each knob into a plain scalar for this frame: scalar knobs into
// `base + kick * kickCurve`, beatRatio knobs into their instantaneous rate
// (cycles per beat), which the engine then integrates into a running phase.
export function resolveKnobs(schema: KnobSchema, values: KnobValues, kick: number): ResolvedKnobs {
  const resolved: ResolvedKnobs = {};
  for (const key in schema) {
    const def = schema[key];
    const v = values[key] ?? def.default;
    if (def.type === 'beatRatio') {
      resolved[key] = 'den' in v && v.den !== 0 ? v.num / v.den : 0;
    } else {
      const sv = v as ScalarKnobValue;
      resolved[key] = sv.base + sv.kick * kick;
    }
  }
  return resolved;
}
