import type { EffectEvent } from './controlMessages';
import type { DemoEffectId } from './demoEffects';

// Transport-agnostic control surface for the effect generator. In-tab an adapter
// satisfies it with direct calls; a WebSocket adapter can satisfy the same
// interface unchanged. Async so both transports share one contract.
export interface EffectControl {
  setEffect(id: DemoEffectId): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  setBpm(bpm: number): Promise<void>;
  // Anchor the beat clock to the downbeat
  cueBeat(): Promise<void>;
  // Observe engine events (state, beats). Returns an unsubscribe.
  subscribe?(listener: (event: EffectEvent) => void): () => void;
}
