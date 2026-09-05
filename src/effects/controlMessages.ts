import { z } from 'zod';

export const scalarKnobValue = z.object({ base: z.number(), kick: z.number() });
export const beatRatioKnobValue = z.object({ num: z.number(), den: z.number() });
export const knobValue = z.union([scalarKnobValue, beatRatioKnobValue]);
export const rampPoint = z.object({ h: z.number(), s: z.number(), l: z.number() });

export const blendMode = z.enum(['over', 'add', 'screen', 'multiply']);

// A layer instance's runtime state: its knob values and current ramp.
export const layerState = z.object({
  knobs: z.record(z.string(), knobValue),
  ramp: z.array(rampPoint).optional(),
});

// Per-instance starting-value overrides baked into a serialized layer def.
export const knobDefaults = z.record(z.string(), scalarKnobValue.partial());

// A serializable layer instance: the kind referenced by registry id, its blend,
// a seed ramp, and any per-instance knob-default overrides.
export const layerDef = z.object({
  name: z.string(),
  kind: z.string(),
  blend: blendMode,
  ramp: z.array(rampPoint).optional(),
  defaults: knobDefaults.optional(),
});
export type LayerDef = z.infer<typeof layerDef>;

// The live stack's per-layer knob/ramp state, keyed layer → { knobs, ramp }.
export const layerParams = z.record(z.string(), layerState);
export type LayerParams = z.infer<typeof layerParams>;

// A saved "look": a layer stack plus its per-layer knob/ramp state, nothing else.
// Speed, global brightness, and tempo/downbeat are live transport controls, so a
// look never carries them.
export const preset = z.object({ layers: z.array(layerDef), params: layerParams });
export type Preset = z.infer<typeof preset>;

export const presetSlots = z.array(preset.nullable());
export type Slots = z.infer<typeof presetSlots>;

const slotIndex = z.number().int().nonnegative();

// Browser control UI → runner.
export const controlCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-speed'), speed: z.number() }),
  z.object({ type: z.literal('set-brightness'), brightness: z.number() }),
  z.object({ type: z.literal('set-bpm'), bpm: z.number() }),
  z.object({ type: z.literal('set-running'), running: z.boolean() }),
  // Replace the whole live stack: covers reorder, blend, add, remove, swap-kind.
  z.object({ type: z.literal('set-layers'), layers: z.array(layerDef) }),
  z.object({
    type: z.literal('set-param'),
    layer: z.string(),
    key: z.string(),
    field: z.enum(['base', 'kick', 'num', 'den']),
    value: z.number(),
  }),
  z.object({ type: z.literal('set-ramp'), layer: z.string(), ramp: z.array(rampPoint) }),
  z.object({ type: z.literal('set-output'), host: z.string(), port: z.number().int().positive() }),
  z.object({ type: z.literal('cue-beat') }),
  z.object({ type: z.literal('select-preset'), slot: slotIndex }),
  z.object({ type: z.literal('clear-preset'), slot: slotIndex }),
  z.object({ type: z.literal('set-presets'), slots: presetSlots }),
]);
export type ControlCommand = z.infer<typeof controlCommand>;

// Current live state, snapshotted on connect and re-emitted after every change so
// multiple controllers stay in sync. `layers` is the editable live stack; `params`
// its per-layer knob/ramp state.
export const controlState = z.object({
  type: z.literal('state'),
  running: z.boolean(),
  speed: z.number(),
  brightness: z.number(),
  bpm: z.number(),
  layers: z.array(layerDef),
  params: layerParams,
});
export type ControlState = z.infer<typeof controlState>;

export const effectSettings = controlState.omit({ type: true }).partial();
export type EffectSettings = z.infer<typeof effectSettings>;

export const controlBeat = z.object({ type: z.literal('beat'), beat: z.number() });
export type ControlBeat = z.infer<typeof controlBeat>;

// Dev/HMR-only: a full engine snapshot (stack + knobs + animation clock) carried
// across a hot code swap so the running show resumes in place.
export const effectResumeState = z.object({
  running: z.boolean(),
  speed: z.number(),
  brightness: z.number(),
  bpm: z.number().positive(),
  phase: z.number(),
  beat: z.number(),
  layers: z.array(layerDef),
  params: layerParams.optional(),
  phases: z.record(z.string(), z.record(z.string(), z.number())).optional(),
});
export type EffectResumeState = z.infer<typeof effectResumeState>;

// sACN destination, a runner-only concern: emitted on connect and after a
// set-output command so every controller shows the live target.
export const controlOutput = z.object({
  type: z.literal('output'),
  sacnHost: z.string(),
  sacnPort: z.number(),
});
export type ControlOutput = z.infer<typeof controlOutput>;

// The preset slots and which one the live controls currently mirror, emitted on
// connect and after every structural change (select/clear/import/beat-fire). An
// `armed` slot is a select waiting for the next downbeat to land. Edits to the
// active slot ride the state stream instead, so this doesn't fire per knob move.
export const presetsEvent = z.object({
  type: z.literal('presets'),
  slots: presetSlots,
  active: slotIndex.nullable(),
  armed: slotIndex.nullable(),
});
export type PresetsEvent = z.infer<typeof presetsEvent>;

export const effectEvent = z.discriminatedUnion('type', [
  controlState,
  controlBeat,
  controlOutput,
  presetsEvent,
]);
export type EffectEvent = z.infer<typeof effectEvent>;
