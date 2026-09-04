import { z } from 'zod';
import { demoEffectId, effectParams } from './effects/controlMessages';

// A saved "look": the effect and its knob settings, nothing else. Speed, global
// brightness, tempo/downbeat cue, and sACN output are live performance controls,
// so recalling a preset changes only the effect selection and its knobs.
export const preset = z.object({
  effect: demoEffectId,
  params: effectParams,
});
export type Preset = z.infer<typeof preset>;

export const SLOT_COUNT = 8;

// The sim's preset bank, kept in localStorage alongside effectStorage. Synchronous
// and cheap, so writes need no debounce or flush.
const KEY = 'gothicFolly.presets';

const presetBank = z.array(preset.nullable());

function empty(): (Preset | null)[] {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

// Pad/truncate a parsed bank to exactly SLOT_COUNT slots, so a changed SLOT_COUNT
// or a hand-edited store can never desync the UI.
function normalize(slots: (Preset | null)[]): (Preset | null)[] {
  const out = empty();
  for (let i = 0; i < SLOT_COUNT; i++) out[i] = slots[i] ?? null;
  return out;
}

export function loadPresets(): (Preset | null)[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = presetBank.safeParse(JSON.parse(raw));
    if (parsed.success) return normalize(parsed.data);
    console.warn(`[sim] ignoring malformed ${KEY}: ${parsed.error.message}`);
  } catch (err) {
    console.warn(`[sim] could not read ${KEY}:`, err);
  }
  return empty();
}

export function savePresets(slots: (Preset | null)[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots));
  } catch (err) {
    console.warn(`[sim] ${KEY} not persisted:`, err);
  }
}
