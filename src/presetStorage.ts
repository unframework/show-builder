import { presetSlots } from './effects/controlMessages';
import { emptySlots, normalizeFile, presetsFile, type PresetsFile } from './effects/presets';

// The sim's analogue of the runner's presets.json, kept in localStorage. The sim
// has no server, so the same one-slot-active model runs against local storage.
const KEY = 'gothicFolly.presets';

export function loadPresetsFile(): PresetsFile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { slots: emptySlots(), active: null };
    const value = JSON.parse(raw);
    const parsed = presetsFile.safeParse(value);
    if (parsed.success) return normalizeFile(parsed.data);
    // A bare slot array is the pre-active-slot format.
    const legacy = presetSlots.safeParse(value);
    if (legacy.success) return normalizeFile({ slots: legacy.data, active: null });
    console.warn(`[sim] ignoring malformed ${KEY}: ${parsed.error.message}`);
  } catch (err) {
    console.warn(`[sim] could not read ${KEY}:`, err);
  }
  return { slots: emptySlots(), active: null };
}

export function savePresetsFile(file: PresetsFile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(file));
  } catch (err) {
    console.warn(`[sim] ${KEY} not persisted:`, err);
  }
}
