import type { DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';

export function mockEffectControl(effect: DemoEffectId): EffectControl {
  const noop = () => Promise.resolve();
  return {
    setEffect: noop,
    setSpeed: noop,
    setBrightness: noop,
    setBpm: noop,
    setParam: noop,
    setRunning: noop,
    cueBeat: noop,
    subscribe(listener) {
      listener({
        type: 'state',
        effect,
        running: true,
        speed: 1,
        brightness: 1,
        bpm: 120,
      });
      return () => {};
    },
  };
}
