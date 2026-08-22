import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { demoEffectId } from '../effects/controlMessages';

const FILE = 'settings.json';
const SAVE_DEBOUNCE_MS = 750;

// The subset of runner state that survives a restart: the sACN destination plus
// the live knobs (`EffectSource.getState()` minus its `type` tag). Every field is
// optional so a partial or older file still loads.
export const runnerSettings = z
  .object({
    sacnHost: z.string(),
    sacnPort: z.number().int().positive(),
    effect: demoEffectId,
    running: z.boolean(),
    speed: z.number(),
    brightness: z.number(),
    bpm: z.number(),
  })
  .partial();
export type RunnerSettings = z.infer<typeof runnerSettings>;

export interface SettingsSaver {
  save(settings: RunnerSettings): void;
  flush(): Promise<void>;
}

// systemd's StateDirectory= grants a persistent writable dir even under
// DynamicUser; RUNNER_STATE_DIR overrides it; otherwise a dev-only repo-local dir.
export function resolveStateDir(): string {
  const explicit = process.env.RUNNER_STATE_DIR;
  if (explicit) return explicit;
  const systemd = process.env.STATE_DIRECTORY?.split(':')[0];
  if (systemd) return systemd;
  return join(process.cwd(), '.runner-state');
}

export async function loadSettings(dir: string): Promise<RunnerSettings> {
  try {
    const raw = await readFile(join(dir, FILE), 'utf8');
    const parsed = runnerSettings.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn(`[runner] ignoring malformed ${FILE}: ${parsed.error.message}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[runner] could not read ${FILE}:`, err);
    }
  }
  return {};
}

// Persistence is best-effort: a read-only target logs once and the show plays on.
// Writes throttle to at most one per window and land atomically via a temp rename.
export function createSettingsSaver(dir: string): SettingsSaver {
  const path = join(dir, FILE);
  const tmp = `${path}.tmp`;
  let pending: RunnerSettings | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warned = false;

  const flush = async (): Promise<void> => {
    const settings = pending;
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!settings) return;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(tmp, JSON.stringify(settings, null, 2) + '\n');
      await rename(tmp, path);
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn(`[runner] settings not persisted (${dir} not writable?):`, err);
      }
    }
  };

  return {
    save(settings) {
      pending = settings;
      timer ??= setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    flush,
  };
}
