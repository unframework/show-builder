import type { EffectEvent, Slots } from './controlMessages';
import type { DemoEffectId } from './demoEffects';
import type { Ramp } from './stages';

// Transport-agnostic control surface for the effect generator. In-tab an adapter
// satisfies it with direct calls; a WebSocket adapter can satisfy the same
// interface unchanged. Async so both transports share one contract.
export interface EffectControl {
  setEffect(id: DemoEffectId): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  setBrightness(brightness: number): Promise<void>;
  setBpm(bpm: number): Promise<void>;
  // Set one field of a layer knob's value: base/kick for scalar knobs, num/den for
  // beatRatio knobs.
  setParam(
    effect: DemoEffectId,
    layer: string,
    key: string,
    field: 'base' | 'kick' | 'num' | 'den',
    value: number,
  ): Promise<void>;
  // Replace a layer's ramp (runtime state).
  setRamp(effect: DemoEffectId, layer: string, ramp: Ramp): Promise<void>;
  // Halt phase advance and emission; the beat clock keeps running
  setRunning(running: boolean): Promise<void>;
  // Anchor the beat clock to the downbeat
  cueBeat(): Promise<void>;
  // Observe engine events (state, beats). Returns an unsubscribe.
  subscribe?(listener: (event: EffectEvent) => void): () => void;
}

// Preset slots as a control surface: one slot is active at a time and mirrors the
// live controls, so there's no save — selecting binds, editing rewrites in place.
// Both adapters replay the current `presets` event to each new subscriber.
export interface PresetControl {
  selectPreset(slot: number): void | Promise<void>;
  clearPreset(slot: number): void | Promise<void>;
  setPresets(slots: Slots): void | Promise<void>;
}

export type PresetSource = EffectControl & PresetControl;
