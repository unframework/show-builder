import { useEffect, useRef } from 'react';
import type { CathedralEngine } from './engine/CathedralEngine';
import { EffectSource } from './engine/EffectSource';
import type { DemoEffectId } from './engine/demoEffects';

export interface EffectSourceHandle {
  setEffect: (id: DemoEffectId) => void;
  setSpeed: (speed: number) => void;
}

// Drives the procedural EffectSource, which feeds the engine whenever the relay
// is idle. Live frames win: the source runs only while `isLive` is false.
export function useEffectSource(
  engine: CathedralEngine | null,
  isLive: boolean,
): EffectSourceHandle {
  const sourceRef = useRef<EffectSource | null>(null);

  useEffect(() => {
    if (!engine) return;
    const source = new EffectSource(engine.getPixels(), (u, bytes) =>
      engine.applyUniverse(u, bytes),
    );
    sourceRef.current = source;
    return () => {
      source.stop();
      sourceRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    if (isLive) source.stop();
    else source.start();
  }, [engine, isLive]);

  return {
    setEffect: (id) => sourceRef.current?.setEffect(id),
    setSpeed: (speed) => sourceRef.current?.setSpeed(speed),
  };
}
