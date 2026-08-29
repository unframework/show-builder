import type { EffectParams } from './effects/controlMessages';
import type { DemoEffectId } from './effects/demoEffects';
import type { EffectControl } from './effects/effectControl';

// The undoable document: the persisted show settings, minus transport (play/pause,
// beat cue) which are live performance controls, not edits. `output` (the sACN
// target) is present only in the runner, whose control also exposes setOutput.
export interface ControlSnapshot {
  effect: DemoEffectId;
  speed: number;
  brightness: number;
  bpm: number;
  params: EffectParams;
  output?: { host: string; port: number };
}

// Runner control adds sACN retargeting; the in-tab adapter omits it.
export type OutputCapable = { setOutput?(host: string, port: number): Promise<void> };

// Order-independent identity of a snapshot: two snapshots with the same signature
// are the same edit, so echoes and no-op changes never spawn a history step.
export function snapshotSignature(s: ControlSnapshot): string {
  const params = Object.keys(s.params)
    .sort()
    .map((effect) => {
      const layers = s.params[effect];
      return [
        effect,
        Object.keys(layers)
          .sort()
          .map((layer) => {
            const st = layers[layer];
            return [
              layer,
              Object.keys(st.knobs)
                .sort()
                .map((k) => [k, st.knobs[k].base, st.knobs[k].kick]),
              st.ramp ?? null,
            ];
          }),
      ];
    });
  const output = s.output ? [s.output.host, s.output.port] : null;
  return JSON.stringify([s.effect, s.speed, s.brightness, s.bpm, params, output]);
}

// Drive `control` from `from` to `to` with the fewest mutations, returning how many
// were issued. Zero means the states were equivalent and no echo will follow.
export function restoreSnapshot(
  control: EffectControl & OutputCapable,
  from: ControlSnapshot,
  to: ControlSnapshot,
): number {
  const ops: Array<Promise<void>> = [];
  if (to.effect !== from.effect) ops.push(control.setEffect(to.effect));
  if (to.speed !== from.speed) ops.push(control.setSpeed(to.speed));
  if (to.brightness !== from.brightness) ops.push(control.setBrightness(to.brightness));
  if (to.bpm !== from.bpm) ops.push(control.setBpm(to.bpm));

  for (const effect of Object.keys(to.params) as DemoEffectId[]) {
    const target = to.params[effect];
    const current = from.params[effect] ?? {};
    for (const layer of Object.keys(target)) {
      const t = target[layer];
      const c = current[layer];
      for (const key of Object.keys(t.knobs)) {
        const tv = t.knobs[key];
        const cv = c?.knobs[key];
        if (!cv || cv.base !== tv.base)
          ops.push(control.setParam(effect, layer, key, 'base', tv.base));
        if (!cv || cv.kick !== tv.kick)
          ops.push(control.setParam(effect, layer, key, 'kick', tv.kick));
      }
      if (t.ramp && JSON.stringify(t.ramp) !== JSON.stringify(c?.ramp)) {
        ops.push(control.setRamp(effect, layer, t.ramp));
      }
    }
  }

  const out = to.output;
  if (
    out &&
    control.setOutput &&
    (!from.output || from.output.host !== out.host || from.output.port !== out.port)
  ) {
    ops.push(control.setOutput(out.host, out.port));
  }
  return ops.length;
}
