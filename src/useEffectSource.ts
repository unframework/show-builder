import { useEffect, useRef, useState } from 'react';
import type { EffectEvent } from './effects/controlMessages';
import type { CathedralEngine } from './engine/CathedralEngine';
import { EffectSource, type ResumeState } from './effects/EffectSource';
import type { EffectControl } from './effects/effectControl';

// Rebound when the engine module hot-swaps so `new ActiveEffectSource()` picks
// up the new code (the static import binding is not rebound by hot.accept).
let ActiveEffectSource = EffectSource;
let requestRebuild: (() => void) | null = null;

if (import.meta.hot) {
  import.meta.hot.accept('./effects/EffectSource', (mod) => {
    if (!mod) return;
    ActiveEffectSource = mod.EffectSource;
    requestRebuild?.();
  });
}

// Drives the procedural EffectSource, which feeds the engine whenever the relay
// is idle. Live frames win: the rAF loop runs only while `isLive` is false.
export function useEffectSource(engine: CathedralEngine | null, isLive: boolean): EffectControl {
  const sourceRef = useRef<EffectSource | null>(null);
  const listenersRef = useRef(new Set<(event: EffectEvent) => void>());
  const resumeRef = useRef<ResumeState | null>(null);
  const [rebuildNonce, setRebuildNonce] = useState(0);

  useEffect(() => {
    if (!import.meta.hot) return;
    requestRebuild = () => setRebuildNonce((n) => n + 1);
    return () => {
      requestRebuild = null;
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const resume = import.meta.hot ? (resumeRef.current ?? undefined) : undefined;
    resumeRef.current = null;
    const source = new ActiveEffectSource(
      engine.getPixels(),
      engine.getFocus(),
      (u, bytes) => engine.applyUniverse(u, bytes),
      resume,
    );
    const unsubscribe = source.subscribe((event) => {
      for (const listener of listenersRef.current) listener(event);
    });
    sourceRef.current = source;
    return () => {
      if (import.meta.hot) resumeRef.current = source.getResumeState();
      unsubscribe();
      sourceRef.current = null;
    };
  }, [engine, rebuildNonce]);

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
    setBrightness: async (brightness) => {
      sourceRef.current?.setBrightness(brightness);
    },
    setBpm: async (bpm) => {
      sourceRef.current?.setBpm(bpm);
    },
    setRunning: async (running) => {
      sourceRef.current?.setRunning(running);
    },
    cueBeat: async () => {
      sourceRef.current?.cueBeat();
    },
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
  };
}
