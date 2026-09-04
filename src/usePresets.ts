import { useCallback, useEffect, useRef, useState } from 'react';
import type { EffectControl } from './effects/effectControl';
import type { DemoEffectId } from './effects/demoEffects';
import type { EffectParams } from './effects/controlMessages';
import {
  restoreSnapshot,
  snapshotSignature,
  type ControlSnapshot,
  type OutputCapable,
} from './controlHistory';
import { loadPresets, savePresets, type Preset } from './presetStorage';

type Control = EffectControl & OutputCapable;

export interface Presets {
  slots: (Preset | null)[];
  activeIndex: number | null;
  armedIndex: number | null;
  // Arm slot i to fire on the next beat (or disarm it if already armed).
  load(i: number): void;
  // Apply slot i immediately, skipping beat alignment.
  loadNow(i: number): void;
  // Capture the current live look into slot i.
  save(i: number): void;
  clear(i: number): void;
}

// Signature of just the visible "look" — the active effect and its knobs — with the
// live speed/brightness/bpm folded in so they don't affect the match. Two states with
// the same look-signature render identically, regardless of the current tempo.
function lookSignature(effect: DemoEffectId, params: EffectParams, live: ControlSnapshot): string {
  return snapshotSignature({
    effect,
    speed: live.speed,
    brightness: live.brightness,
    bpm: live.bpm,
    params: { [effect]: params[effect] ?? {} },
  });
}

function computeActive(live: ControlSnapshot, slots: (Preset | null)[]): number | null {
  const current = lookSignature(live.effect, live.params, live);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.effect === live.effect && lookSignature(s.effect, s.params, live) === current)
      return i;
  }
  return null;
}

// Build the restore target for a slot: its effect + knobs, but inheriting the current
// live speed/brightness/bpm so restoreSnapshot leaves those (and the downbeat cue)
// untouched — only the effect selection and knob values change.
function targetFor(slot: Preset, live: ControlSnapshot): ControlSnapshot {
  return {
    effect: slot.effect,
    params: slot.params,
    speed: live.speed,
    brightness: live.brightness,
    bpm: live.bpm,
  };
}

export function usePresets(source: Control | null): Presets {
  const [slots, setSlots] = useState<(Preset | null)[]>(() => loadPresets());
  const [armedIndex, setArmedIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Refs mirror state so the subscribe/beat callbacks read live values without
  // re-subscribing on every change.
  const live = useRef<ControlSnapshot | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const armedRef = useRef(armedIndex);
  armedRef.current = armedIndex;

  const syncActive = useCallback(() => {
    const l = live.current;
    const idx = l ? computeActive(l, slotsRef.current) : null;
    setActiveIndex((cur) => (cur === idx ? cur : idx));
  }, []);

  // Recompute active highlight when the bank changes (save/clear).
  useEffect(() => {
    syncActive();
  }, [slots, syncActive]);

  useEffect(() => {
    if (!source?.subscribe) return;
    const unsubscribe = source.subscribe((event) => {
      if (event.type === 'state') {
        live.current = {
          effect: event.effect,
          speed: event.speed,
          brightness: event.brightness,
          bpm: event.bpm,
          params: event.params ?? {},
        };
        syncActive();
      } else if (event.type === 'beat') {
        const idx = armedRef.current;
        if (idx == null) return;
        const slot = slotsRef.current[idx];
        const from = live.current;
        setArmedIndex(null);
        if (slot && from) restoreSnapshot(source, from, targetFor(slot, from));
      }
    });
    return unsubscribe;
  }, [source, syncActive]);

  const load = useCallback((i: number) => {
    if (!slotsRef.current[i]) return; // nothing to load from an empty slot
    setArmedIndex((cur) => (cur === i ? null : i));
  }, []);

  const loadNow = useCallback(
    (i: number) => {
      const slot = slotsRef.current[i];
      const from = live.current;
      setArmedIndex(null);
      if (source && slot && from) restoreSnapshot(source, from, targetFor(slot, from));
    },
    [source],
  );

  const save = useCallback((i: number) => {
    const from = live.current;
    if (!from) return;
    const captured: Preset = { effect: from.effect, params: from.params };
    setSlots((prev) => {
      const next = prev.slice();
      next[i] = captured;
      savePresets(next);
      return next;
    });
  }, []);

  const clear = useCallback((i: number) => {
    setArmedIndex((cur) => (cur === i ? null : cur));
    setSlots((prev) => {
      const next = prev.slice();
      next[i] = null;
      savePresets(next);
      return next;
    });
  }, []);

  return { slots, activeIndex, armedIndex, load, loadNow, save, clear };
}
