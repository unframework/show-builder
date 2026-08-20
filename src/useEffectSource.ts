import { useEffect, useRef } from 'react';
import type { CathedralEngine } from './engine/CathedralEngine';
import { EffectSource } from './effects/EffectSource';
import type { EffectControl } from './effects/effectControl';

// Drives the procedural EffectSource, which feeds the engine whenever the relay
// is idle. Live frames win: the rAF loop runs only while `isLive` is false.
export function useEffectSource(engine: CathedralEngine | null, isLive: boolean): EffectControl {
  const sourceRef = useRef<EffectSource | null>(null);

  useEffect(() => {
    if (!engine) return;
    sourceRef.current = new EffectSource(engine.getPixels(), engine.getFocus(), (u, bytes) =>
      engine.applyUniverse(u, bytes),
    );
    return () => {
      sourceRef.current = null;
    };
  }, [engine]);

  useEffect(() => {
    if (!engine || isLive) return;
    let frame = 0;
    let lastTs: number | null = null;
    const tick = (ts: number): void => {
      frame = requestAnimationFrame(tick);
      sourceRef.current?.renderFrame(lastTs === null ? 0 : (ts - lastTs) / 1000);
      lastTs = ts;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, isLive]);

  return {
    setEffect: async (id) => {
      sourceRef.current?.setEffect(id);
    },
    setSpeed: async (speed) => {
      sourceRef.current?.setSpeed(speed);
    },
    setBpm: async (bpm) => {
      sourceRef.current?.setBpm(bpm);
    },
    cueBeat: async () => {
      sourceRef.current?.cueBeat();
    },
  };
}
