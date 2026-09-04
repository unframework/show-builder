import { hslToRgb } from './color';
import type { EffectInput } from './demoEffects';
import type { KnobSchema, KnobValues, ResolvedKnobs, ScalarKnobValue } from './knobs';
import type { Ramp } from './stages';

export type Hsla = [number, number, number, number];

export type BlendMode = 'over' | 'add' | 'screen' | 'multiply';

// Authored in HSL (+ coverage), composited in RGB: hue is the wrong space to mix
// dissimilar colours, and add/screen/multiply only mean anything on light. Reads
// generic knobs (the instance name scopes them) plus, for ramp-driven kinds, the
// current ramp from runtime state.
export type Paint = (input: EffectInput, knobs: ResolvedKnobs, ramp?: Ramp) => Hsla;

// A composited layer. Blend and identity come from the effect topology. `ramp` is
// display-only metadata for kinds not yet on the runtime-ramp path; kinds that own
// their ramp as runtime state leave it undefined and read the ramp `paint` arg.
export interface Layer {
  name: string;
  blend: BlendMode;
  ramp?: Ramp;
  paint: Paint;
}

// A reusable layer kind: paint logic coupled with the knob schema paint reads.
// Name- and blend-agnostic. `schema` is eager (statically knowable); `makePaint`
// is deferred over the runtime ctx, so schemas derive without it.
export interface LayerKind<Ctx> {
  schema: KnobSchema;
  makePaint: (ctx: Ctx) => Paint;
}

// Per-knob starting-value overrides for a kind reused across instances: each
// instance can retune the shared schema's base/kick without its own kind.
// (Scalar knobs only; beatRatio knobs carry their fraction in the schema.)
export type KnobDefaults = Record<string, Partial<ScalarKnobValue>>;

// One named instance of a kind in an effect's static stack: its blend, a default
// ramp seeding runtime state, and any per-instance knob-default overrides.
export interface LayerSlot<Ctx> {
  name: string;
  blend: BlendMode;
  kind: LayerKind<Ctx>;
  ramp?: Ramp;
  defaults?: KnobDefaults;
}

// Per-instance runtime state: knob values and the current ramp.
export interface LayerState {
  knobs: KnobValues;
  ramp?: Ramp;
}

// Resolved-per-frame runtime a layer paints from.
export interface LayerRuntime {
  knobs: ResolvedKnobs;
  ramp?: Ramp;
}

export const defineKind = <Ctx>(kind: LayerKind<Ctx>): LayerKind<Ctx> => kind;

export const slot = <Ctx>(
  name: string,
  blend: BlendMode,
  kind: LayerKind<Ctx>,
  ramp?: Ramp,
  defaults?: KnobDefaults,
): LayerSlot<Ctx> => ({ name, blend, kind, ramp, defaults });

// Overlay per-instance starting values onto a shared schema.
function withDefaults(schema: KnobSchema, defaults?: KnobDefaults): KnobSchema {
  if (!defaults) return schema;
  const out: KnobSchema = {};
  for (const key in schema) {
    const def = schema[key];
    const override = defaults[key];
    out[key] =
      override && def.type !== 'beatRatio'
        ? { ...def, default: { ...def.default, ...override } }
        : def;
  }
  return out;
}

// The effect's namespaced knob schema, keyed by instance name; knob-less kinds
// drop out so a knob-free effect yields an empty map.
export function topologySchemas<Ctx>(slots: LayerSlot<Ctx>[]): Record<string, KnobSchema> {
  const out: Record<string, KnobSchema> = {};
  for (const { name, kind, defaults } of slots) {
    if (Object.keys(kind.schema).length) out[name] = withDefaults(kind.schema, defaults);
  }
  return out;
}

// The seed ramps that runtime state starts from, keyed by instance name.
export function topologyRamps<Ctx>(slots: LayerSlot<Ctx>[]): Record<string, Ramp> {
  const out: Record<string, Ramp> = {};
  for (const { name, ramp } of slots) if (ramp) out[name] = ramp;
  return out;
}

// Bind each slot's paint to the runtime ctx. Array order is paint order.
export function buildLayers<Ctx>(slots: LayerSlot<Ctx>[], ctx: Ctx): Layer[] {
  return slots.map(({ name, blend, kind }) => ({ name, blend, paint: kind.makePaint(ctx) }));
}

const NO_RUNTIME: LayerRuntime = { knobs: {} };

// Composite the stack bottom→top into `out` at `ch0`, in linear RGB. The floor is
// black, so the bottom layer resolves to its own color under any blend mode.
// Results stay unclamped floats — the output stage caps them, leaving additive
// headroom for a downstream limiter.
export function paintLayers(
  out: Float64Array,
  ch0: number,
  layers: Layer[],
  input: EffectInput,
  byLayer: Record<string, LayerRuntime>,
): void {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const layer of layers) {
    const rt = byLayer[layer.name] ?? NO_RUNTIME;
    const [h, s, l, a] = layer.paint(input, rt.knobs, rt.ramp);
    if (a <= 0) continue;
    const [tr, tg, tb] = hslToRgb(h, s, l);
    switch (layer.blend) {
      case 'over':
        r = r * (1 - a) + tr * a;
        g = g * (1 - a) + tg * a;
        b = b * (1 - a) + tb * a;
        break;
      case 'add':
        r += tr * a;
        g += tg * a;
        b += tb * a;
        break;
      case 'screen':
        r += tr * a * (1 - r);
        g += tg * a * (1 - g);
        b += tb * a * (1 - b);
        break;
      case 'multiply':
        r *= 1 + a * (tr - 1);
        g *= 1 + a * (tg - 1);
        b *= 1 + a * (tb - 1);
        break;
    }
  }
  out[ch0] = r;
  out[ch0 + 1] = g;
  out[ch0 + 2] = b;
}
