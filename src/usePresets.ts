import { useCallback, useEffect, useRef, useState } from 'react';
import { presetSlots, type Preset, type Slots } from './effects/controlMessages';
import type { PresetSource } from './effects/effectControl';
import { emptySlots, normalizeSlots } from './effects/presets';

export type ImportResult = { ok: true } | { ok: false; message: string };

export interface Presets {
  slots: Slots;
  activeIndex: number | null;
  armedIndex: number | null;
  // Bind slot i to the live controls: a filled slot loads on the next beat, an
  // empty one adopts the current look. Editing then rewrites it in place.
  select(i: number): void;
  clear(i: number): void;
  // Download the slots as a JSON file, to carry looks between instances.
  exportBank(): void;
  // Replace all slots from a JSON file exported elsewhere.
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

export function usePresets(source: PresetSource | null): Presets {
  const [slots, setSlots] = useState<Slots>(() => emptySlots());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [armedIndex, setArmedIndex] = useState<number | null>(null);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  // The active slot mirrors the live look, but its stored copy only refreshes on a
  // structural event; the live stream keeps this current for an accurate export.
  const liveLook = useRef<Preset | null>(null);

  useEffect(() => {
    if (!source?.subscribe) return;
    return source.subscribe((event) => {
      if (event.type === 'presets') {
        setSlots(event.slots);
        setActiveIndex(event.active);
        setArmedIndex(event.armed);
      } else if (event.type === 'state') {
        liveLook.current = { effect: event.effect, params: event.params ?? {} };
      }
    });
  }, [source]);

  const select = useCallback((i: number) => source?.selectPreset(i), [source]);
  const clear = useCallback((i: number) => source?.clearPreset(i), [source]);

  const exportBank = useCallback(() => {
    const active = activeRef.current;
    const look = liveLook.current;
    const out = slotsRef.current.map((s, i) => (i === active && look ? look : s));
    downloadJson(JSON.stringify(out, null, 2), bankFilename());
  }, []);

  const importBank = useCallback(
    async (file: File): Promise<ImportResult> => {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        return { ok: false, message: `${file.name} is not valid JSON` };
      }
      const parsed = presetSlots.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[sim] ignoring malformed preset file ${file.name}: ${parsed.error.message}`);
        return { ok: false, message: `${file.name} is not a preset bank` };
      }
      source?.setPresets(normalizeSlots(parsed.data));
      return { ok: true };
    },
    [source],
  );

  return { slots, activeIndex, armedIndex, select, clear, exportBank, importBank };
}
