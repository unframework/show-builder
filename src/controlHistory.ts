import type { LayerDef, LayerParams } from './effects/controlMessages';
import type { EffectControl } from './effects/effectControl';

// The undoable document: the persisted show settings, minus transport (play/pause,
// beat cue) which are live performance controls, not edits. `output` (the sACN
// target) is present only in the runner, whose control also exposes setOutput.
export interface ControlSnapshot {
  layers: LayerDef[];
  speed: number;
  brightness: number;
  bpm: number;
  params: LayerParams;
  output?: { host: string; port: number };
}

// Runner control adds sACN retargeting; the in-tab adapter omits it.
export type OutputCapable = { setOutput?(host: string, port: number): Promise<void> };

// Order-independent identity of a snapshot: two snapshots with the same signature
// are the same edit, so echoes and no-op changes never spawn a history step. The
// layer stack is order-sensitive, so it stays in array order; params fold by key.
export function snapshotSignature(s: ControlSnapshot): string {
  const layers = s.layers.map((l) => [
    l.name,
    l.kind,
    l.blend,
    l.ramp ?? null,
    l.defaults ? Object.entries(l.defaults).sort() : null,
  ]);
  const params = Object.keys(s.params)
    .sort()
    .map((layer) => {
      const st = s.params[layer];
      return [
        layer,
        Object.keys(st.knobs)
          .sort()
          .map((k) => [k, Object.entries(st.knobs[k]).sort()]),
        st.ramp ?? null,
      ];
    });
  const output = s.output ? [s.output.host, s.output.port] : null;
  return JSON.stringify([layers, s.speed, s.brightness, s.bpm, params, output]);
}

// Drive `control` from `from` to `to` with the fewest mutations, returning how many
// were issued. Zero means the states were equivalent and no echo will follow. The
// stack lands before params so freshly-added layers exist to receive them.
export function restoreSnapshot(
  control: EffectControl & OutputCapable,
  from: ControlSnapshot,
  to: ControlSnapshot,
): number {
  const ops: Array<Promise<void>> = [];
  if (JSON.stringify(to.layers) !== JSON.stringify(from.layers)) {
    ops.push(control.setLayers(to.layers));
  }
  if (to.speed !== from.speed) ops.push(control.setSpeed(to.speed));
  if (to.brightness !== from.brightness) ops.push(control.setBrightness(to.brightness));
  if (to.bpm !== from.bpm) ops.push(control.setBpm(to.bpm));

  for (const layer of Object.keys(to.params)) {
    const t = to.params[layer];
    const c = from.params[layer];
    for (const key of Object.keys(t.knobs)) {
      const tv = t.knobs[key] as Record<'base' | 'kick' | 'num' | 'den', number>;
      const cv = c?.knobs[key] as Record<'base' | 'kick' | 'num' | 'den', number> | undefined;
      for (const field of Object.keys(tv) as Array<'base' | 'kick' | 'num' | 'den'>) {
        if (!cv || cv[field] !== tv[field])
          ops.push(control.setParam(layer, key, field, tv[field]));
      }
    }
    if (t.ramp && JSON.stringify(t.ramp) !== JSON.stringify(c?.ramp)) {
      ops.push(control.setRamp(layer, t.ramp));
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
