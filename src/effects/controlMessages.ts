import { z } from 'zod';
import { DEMO_EFFECTS, type DemoEffectId } from './demoEffects';

const demoEffectId = z.enum(DEMO_EFFECTS.map((e) => e.id) as [DemoEffectId, ...DemoEffectId[]]);

// Browser control UI → runner.
export const controlCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-effect'), id: demoEffectId }),
  z.object({ type: z.literal('set-speed'), speed: z.number() }),
  z.object({ type: z.literal('set-bpm'), bpm: z.number() }),
  z.object({ type: z.literal('cue-beat') }),
]);
export type ControlCommand = z.infer<typeof controlCommand>;

// Runner → control UI: current knob state, snapshotted on connect and rebroadcast
// after every command so multiple controllers stay in sync.
export const controlState = z.object({
  type: z.literal('state'),
  effect: demoEffectId,
  speed: z.number(),
  bpm: z.number(),
});
export type ControlState = z.infer<typeof controlState>;
