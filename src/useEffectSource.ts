import { useEffect, useMemo, useRef, useState } from 'react';
import type { EffectEvent } from './effects/controlMessages';
import type { CathedralEngine } from './engine/CathedralEngine';
import { applyEffectSettings, EffectSource, type ResumeState } from './effects/EffectSource';
import { toRgbBytes } from './effects/frameOutput';
import type { EffectControl, PresetControl } from './effects/effectControl';
import { loadEffectSettings, saveEffectSettings } from './effectStorage';
import { loadPresetsFile, savePresetsFile } from './presetStorage';

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
export function useEffectSource(
  engine: CathedralEngine | null,
  isLive: boolean,
): EffectControl & PresetControl {
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
      toRgbBytes((u, bytes) => engine.applyUniverse(u, bytes)),
      resume,
    );
    const unsubscribe = source.subscribe((event) => {
      if (event.type === 'state') saveEffectSettings(event);
      else if (event.type === 'presets')
        savePresetsFile({ slots: event.slots, active: event.active });
      for (const listener of listenersRef.current) listener(event);
    });
    sourceRef.current = source;
    // A hot-reload resume already carries the live knobs (plus the animation
    // clock); only a cold mount needs to replay the persisted ones.
    if (!resume) applyEffectSettings(source, loadEffectSettings());
    source.hydratePresets(loadPresetsFile());
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

  // Stable identity across renders: methods read the live source via refs, so a
  // single adapter survives engine rebuilds and lets consumers key effects on it.
  return useMemo<EffectControl & PresetControl>(
    () => ({
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
      setParam: async (effect, layer, key, field, value) => {
        sourceRef.current?.setParam(effect, layer, key, field, value);
      },
      setRamp: async (effect, layer, ramp) => {
        sourceRef.current?.setRamp(effect, layer, ramp);
      },
      setRunning: async (running) => {
        sourceRef.current?.setRunning(running);
      },
      cueBeat: async () => {
        sourceRef.current?.cueBeat();
      },
      selectPreset: (slot) => {
        sourceRef.current?.selectPreset(slot);
      },
      clearPreset: (slot) => {
        sourceRef.current?.clearPreset(slot);
      },
      setPresets: (slots) => {
        sourceRef.current?.setPresets(slots);
      },
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        const source = sourceRef.current;
        if (source) listener(source.getPresetsEvent());
        return () => listenersRef.current.delete(listener);
      },
    }),
    [],
  );
}
