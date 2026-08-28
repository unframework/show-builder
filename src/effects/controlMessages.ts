import { z } from 'zod';
import { DEMO_EFFECTS, type DemoEffectId } from './demoEffects';

export const demoEffectId = z.enum(
  DEMO_EFFECTS.map((e) => e.id) as [DemoEffectId, ...DemoEffectId[]],
);

export const knobValue = z.object({ base: z.number(), kick: z.number() });
// Per-effect knob values, keyed effect → knob → { base, kick }.
export const effectParams = z.record(z.string(), z.record(z.string(), knobValue));
export type EffectParams = z.infer<typeof effectParams>;

// Browser control UI → runner.
export const controlCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-effect'), id: demoEffectId }),
  z.object({ type: z.literal('set-speed'), speed: z.number() }),
  z.object({ type: z.literal('set-brightness'), brightness: z.number() }),
  z.object({ type: z.literal('set-bpm'), bpm: z.number() }),
  z.object({ type: z.literal('set-running'), running: z.boolean() }),
  z.object({
    type: z.literal('set-param'),
    effect: demoEffectId,
    key: z.string(),
    field: z.enum(['base', 'kick']),
    value: z.number(),
  }),
  z.object({ type: z.literal('set-output'), host: z.string(), port: z.number().int().positive() }),
  z.object({ type: z.literal('cue-beat') }),
]);
export type ControlCommand = z.infer<typeof controlCommand>;

// The active effect's layer stack, for display: names, blend modes, and each
// layer's palette. Static per effect today, but rides the state stream so it's
// ready to become editable.
export const rampPoint = z.object({ h: z.number(), s: z.number(), l: z.number() });
export const layerMeta = z.object({
  name: z.string(),
  blend: z.enum(['over', 'add', 'screen', 'multiply']),
  ramp: z.array(rampPoint).optional(),
});
export type LayerMeta = z.infer<typeof layerMeta>;

// Current knob state, snapshotted on connect and re-emitted after every change so
// multiple controllers stay in sync.
export const controlState = z.object({
  type: z.literal('state'),
  effect: demoEffectId,
  running: z.boolean(),
  speed: z.number(),
  brightness: z.number(),
  bpm: z.number(),
  params: effectParams.optional(),
  layers: z.array(layerMeta).optional(),
});
export type ControlState = z.infer<typeof controlState>;

export const effectSettings = controlState.omit({ type: true, layers: true }).partial();
export type EffectSettings = z.infer<typeof effectSettings>;

export const controlBeat = z.object({ type: z.literal('beat'), beat: z.number() });
export type ControlBeat = z.infer<typeof controlBeat>;

// Dev/HMR-only: a full engine snapshot (knobs + animation clock) carried across
// a hot code swap so the running show resumes in place.
export const effectResumeState = z.object({
  effect: demoEffectId,
  running: z.boolean(),
  speed: z.number(),
  brightness: z.number(),
  bpm: z.number().positive(),
  phase: z.number(),
  beat: z.number(),
  params: effectParams.optional(),
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

export const effectEvent = z.discriminatedUnion('type', [controlState, controlBeat, controlOutput]);
export type EffectEvent = z.infer<typeof effectEvent>;
