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
import { loadPresets, normalize, presetBank, savePresets, type Preset } from './presetStorage';

type Control = EffectControl & OutputCapable;

export type ImportResult = { ok: true } | { ok: false; message: string };

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
  // Download the whole bank as a JSON file, to carry looks between instances.
  exportBank(): void;
  // Replace the whole bank from a JSON file exported elsewhere.
  importBank(file: File): Promise<ImportResult>;
}

function bankFilename(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  return `gothic-folly-presets-${stamp}.json`;
}

function downloadJson(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Identity of a "look" — its effect and knobs, with transport neutralised so speed,
// brightness, and bpm never affect the match. Two looks with the same signature
// render identically.
function lookSignature(effect: DemoEffectId, params: EffectParams): string {
  return snapshotSignature({ effect, speed: 0, brightness: 0, bpm: 0, params });
}

function sameLook(a: Preset, b: Preset): boolean {
  return (
    a.effect === b.effect && lookSignature(a.effect, a.params) === lookSignature(b.effect, b.params)
  );
}

function computeActive(live: ControlSnapshot, slots: (Preset | null)[]): number | null {
  const current = lookSignature(live.effect, live.params);
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.effect === live.effect && lookSignature(s.effect, s.params) === current) return i;
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
  // The slot the live look is bound to: while set, edits fold straight back into
  // it, so a recalled preset stays in sync until another is loaded or it's cleared.
  const boundRef = useRef<number | null>(null);
  // Look signature a recall is settling toward. Auto-commit pauses until the live
  // look reaches it, so a recall's intermediate frames never rewrite the slot.
  const restoringSig = useRef<string | null>(null);

  const syncActive = useCallback(() => {
    const l = live.current;
    const idx = l ? computeActive(l, slotsRef.current) : null;
    setActiveIndex((cur) => (cur === idx ? cur : idx));
  }, []);

  // Recompute active highlight when the bank changes (save/clear).
  useEffect(() => {
    syncActive();
  }, [slots, syncActive]);

  const commitToBound = useCallback(() => {
    const i = boundRef.current;
    const l = live.current;
    if (i == null || !l) return;
    const captured: Preset = { effect: l.effect, params: l.params };
    const prev = slotsRef.current[i];
    if (prev && sameLook(prev, captured)) return;
    setSlots((cur) => {
      const next = cur.slice();
      next[i] = captured;
      savePresets(next);
      return next;
    });
  }, []);

  const recall = useCallback(
    (i: number) => {
      const slot = slotsRef.current[i];
      const from = live.current;
      if (!source || !slot || !from) return;
      boundRef.current = i;
      const to = targetFor(slot, from);
      restoringSig.current = lookSignature(to.effect, to.params);
      if (restoreSnapshot(source, from, to) === 0) restoringSig.current = null;
    },
    [source],
  );

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
        if (restoringSig.current !== null) {
          if (lookSignature(event.effect, event.params ?? {}) === restoringSig.current)
            restoringSig.current = null;
          syncActive();
          return;
        }
        commitToBound();
        syncActive();
      } else if (event.type === 'beat') {
        const idx = armedRef.current;
        if (idx == null) return;
        setArmedIndex(null);
        recall(idx);
      }
    });
    return unsubscribe;
  }, [source, commitToBound, syncActive, recall]);

  const load = useCallback((i: number) => {
    if (!slotsRef.current[i]) return; // nothing to load from an empty slot
    setArmedIndex((cur) => (cur === i ? null : i));
  }, []);

  const loadNow = useCallback(
    (i: number) => {
      setArmedIndex(null);
      recall(i);
    },
    [recall],
  );

  const save = useCallback((i: number) => {
    const from = live.current;
    if (!from) return;
    const captured: Preset = { effect: from.effect, params: from.params };
    boundRef.current = i;
    setSlots((prev) => {
      const next = prev.slice();
      next[i] = captured;
      savePresets(next);
      return next;
    });
  }, []);

  const clear = useCallback((i: number) => {
    setArmedIndex((cur) => (cur === i ? null : cur));
    if (boundRef.current === i) boundRef.current = null;
    setSlots((prev) => {
      const next = prev.slice();
      next[i] = null;
      savePresets(next);
      return next;
    });
  }, []);

  const exportBank = useCallback(() => {
    downloadJson(JSON.stringify(slotsRef.current, null, 2), bankFilename());
  }, []);

  const importBank = useCallback(async (file: File): Promise<ImportResult> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return { ok: false, message: `${file.name} is not valid JSON` };
    }
    const parsed = presetBank.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[sim] ignoring malformed preset file ${file.name}: ${parsed.error.message}`);
      return { ok: false, message: `${file.name} is not a preset bank` };
    }
    const next = normalize(parsed.data);
    boundRef.current = null;
    setArmedIndex(null);
    setSlots(next);
    savePresets(next);
    return { ok: true };
  }, []);

  return { slots, activeIndex, armedIndex, load, loadNow, save, clear, exportBank, importBank };
}
