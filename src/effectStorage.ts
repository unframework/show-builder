import { effectSettings, type ControlState, type EffectSettings } from './effects/controlMessages';

// The sim's analogue of the runner's file-backed settings store: the same effect
// knobs, kept in localStorage so a page reload resumes where the user left off.
// localStorage is synchronous and cheap, so writes need no debounce or flush.
const KEY = 'gothicFolly.effectSettings';

export function loadEffectSettings(): EffectSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = effectSettings.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn(`[sim] ignoring malformed ${KEY}: ${parsed.error.message}`);
  } catch (err) {
    console.warn(`[sim] could not read ${KEY}:`, err);
  }
  return {};
}

export function saveEffectSettings(state: ControlState): void {
  const { effect, running, speed, brightness, bpm, params } = state;
  try {
    localStorage.setItem(KEY, JSON.stringify({ effect, running, speed, brightness, bpm, params }));
  } catch (err) {
    console.warn(`[sim] ${KEY} not persisted:`, err);
  }
}
