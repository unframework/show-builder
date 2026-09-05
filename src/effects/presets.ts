import { z } from 'zod';
import { presetSlots, type Slots } from './controlMessages';

export const SLOT_COUNT = 8;

// The persisted shape, shared by the runner's presets.json and the sim's
// localStorage: the slots plus which one is active. The active slot's live edits
// aren't written here per-move — on load they're reconciled from the restored
// live look, so this only needs the structural snapshot.
export const presetsFile = z.object({
  slots: presetSlots,
  active: z.number().int().nonnegative().nullable(),
});
export type PresetsFile = z.infer<typeof presetsFile>;

export function emptySlots(): Slots {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

// Pad/truncate to exactly SLOT_COUNT so a changed count or a hand-edited store
// can never desync a fixed-size UI.
export function normalizeSlots(slots: Slots): Slots {
  const out = emptySlots();
  for (let i = 0; i < SLOT_COUNT; i++) out[i] = slots[i] ?? null;
  return out;
}

export function normalizeFile(file: PresetsFile): PresetsFile {
  const slots = normalizeSlots(file.slots);
  const active = file.active !== null && slots[file.active] ? file.active : null;
  return { slots, active };
}
