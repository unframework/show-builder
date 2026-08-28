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

// A layer scopes its knobs under a short name: generic keys ("hue", "rise") stay
// meaningful because the layer names them in the stack. Keys are the composite
// `layer${NS}knob`; params, persistence, and the wire protocol stay flat.
export const KNOB_NS = '.';

export function prefixKeys(prefix: string, schema: KnobSchema): KnobSchema {
  const out: KnobSchema = {};
  for (const key in schema) out[`${prefix}${KNOB_NS}${key}`] = schema[key];
  return out;
}

// Regroup resolved knobs back into per-layer scalars, stripping the prefix so each
// layer reads generic names.
export function splitByLayer(resolved: ResolvedKnobs): Record<string, ResolvedKnobs> {
  const out: Record<string, ResolvedKnobs> = {};
  for (const key in resolved) {
    const i = key.indexOf(KNOB_NS);
    const layer = i < 0 ? '' : key.slice(0, i);
    const knob = i < 0 ? key : key.slice(i + 1);
    (out[layer] ??= {})[knob] = resolved[key];
  }
  return out;
}
