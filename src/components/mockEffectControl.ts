import type { LayerDef } from '../effects/controlMessages';
import type { EffectControl } from '../effects/effectControl';

export function mockEffectControl(layers: LayerDef[] = []): EffectControl {
  const noop = () => Promise.resolve();
  return {
    setSpeed: noop,
    setBrightness: noop,
    setBpm: noop,
    setLayers: noop,
    setParam: noop,
    setRamp: noop,
    setRunning: noop,
    cueBeat: noop,
    subscribe(listener) {
      listener({
        type: 'state',
        running: true,
        speed: 1,
        brightness: 1,
        bpm: 120,
        layers,
        params: {},
      });
      return () => {};
    },
  };
}
