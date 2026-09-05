import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emptySlots, normalizeFile, presetsFile, type PresetsFile } from '../effects/presets';
import { createJsonSaver, type JsonSaver } from './settingsStore';

const FILE = 'presets.json';

export async function loadPresets(dir: string): Promise<PresetsFile> {
  try {
    const raw = await readFile(join(dir, FILE), 'utf8');
    const parsed = presetsFile.safeParse(JSON.parse(raw));
    if (parsed.success) return normalizeFile(parsed.data);
    console.warn(`[runner] ignoring malformed ${FILE}: ${parsed.error.message}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[runner] could not read ${FILE}:`, err);
    }
  }
  return { slots: emptySlots(), active: null };
}

export function createPresetsSaver(dir: string): JsonSaver<PresetsFile> {
  return createJsonSaver<PresetsFile>(dir, FILE);
}
