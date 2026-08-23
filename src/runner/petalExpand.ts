import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ROSE_CELL_CHANNEL } from '../scene/zones';

// The rose window is authored at the cell level (16 petals × 14 cells, petals
// 1–8 on universe 1, 9–16 on universe 2). Each petal's physical strip is ~517
// WS2815 LEDs, driven from an appended universe block (u76+). This mirrors
// expand-fseq.py: it duplicates each cell's color across that cell's physical
// LEDs live per frame, so the runner lights real hardware petals. Runner-only —
// the browser sim never loads the config and stays at cell resolution.

type Emit = (universe: number, bytes: Uint8Array) => void;

const CH_PER_PIXEL = 3;
const CH_PER_UNIVERSE = 510;
const LEDS_PER_UNIVERSE = CH_PER_UNIVERSE / CH_PER_PIXEL;
const PETAL_CH = 42;
const PETALS = 16;
const EXP_BASE_UNIV = 76;
const UNIV_PER_PETAL = 4;
const MAX_LEDS_PER_PETAL = UNIV_PER_PETAL * LEDS_PER_UNIVERSE;

const sourceUniverse = (petal: number): number => (petal <= 8 ? 1 : 2);
const srcLocalBase = (petal: number): number => ((petal - 1) % 8) * PETAL_CH;
const expBaseUniverse = (petal: number): number => EXP_BASE_UNIV + (petal - 1) * UNIV_PER_PETAL;

const segment = z.object({
  cell: z.string(),
  count: z.number().int().nonnegative(),
  skip_before: z.number().int().nonnegative().optional(),
});
type Segment = z.infer<typeof segment>;

const petalOverride = z.object({
  segments: z.array(segment).optional(),
  default_segments: z.array(segment).optional(),
});

const petalConfig = z.object({
  default_segments: z.array(segment),
  petal_overrides: z.record(z.string(), petalOverride).optional(),
});
export type PetalConfig = z.infer<typeof petalConfig>;

function resolveSegments(config: PetalConfig): Map<number, Segment[]> {
  const byPetal = new Map<number, Segment[]>();
  for (let petal = 1; petal <= PETALS; petal++) {
    const override = config.petal_overrides?.[`P${String(petal).padStart(2, '0')}`];
    byPetal.set(petal, override?.segments ?? override?.default_segments ?? config.default_segments);
  }
  return byPetal;
}

interface CopyOp {
  dst: number;
  src: number;
}

interface ExpandPlan {
  bySource: Map<number, Map<number, CopyOp[]>>;
  bufferLen: Map<number, number>;
}

function buildExpandPlan(segsByPetal: Map<number, Segment[]>): ExpandPlan {
  const bySource = new Map<number, Map<number, CopyOp[]>>();
  const bufferLen = new Map<number, number>();

  const opsFor = (source: number, universe: number): CopyOp[] => {
    const universes = bySource.get(source) ?? new Map<number, CopyOp[]>();
    bySource.set(source, universes);
    const ops = universes.get(universe) ?? [];
    universes.set(universe, ops);
    return ops;
  };

  for (let petal = 1; petal <= PETALS; petal++) {
    const source = sourceUniverse(petal);
    const base = srcLocalBase(petal);
    const firstUniverse = expBaseUniverse(petal);
    let led = 0;
    segments: for (const seg of segsByPetal.get(petal)!) {
      led += seg.skip_before ?? 0;
      const cellOffset = ROSE_CELL_CHANNEL[seg.cell];
      if (cellOffset === undefined) {
        console.warn(
          `[runner] petal-config: unknown rose cell "${seg.cell}" (petal ${petal}) skipped`,
        );
        continue;
      }
      const src = base + cellOffset;
      for (let k = 0; k < seg.count; k++, led++) {
        if (led >= MAX_LEDS_PER_PETAL) {
          console.warn(
            `[runner] petal-config: petal ${petal} exceeds ${MAX_LEDS_PER_PETAL} LEDs; truncated`,
          );
          break segments;
        }
        const universe = firstUniverse + Math.floor(led / LEDS_PER_UNIVERSE);
        const dst = (led % LEDS_PER_UNIVERSE) * CH_PER_PIXEL;
        opsFor(source, universe).push({ dst, src });
        bufferLen.set(universe, Math.max(bufferLen.get(universe) ?? 0, dst + CH_PER_PIXEL));
      }
    }
  }
  return { bySource, bufferLen };
}

export interface PetalExpander {
  wrap(emit: Emit): Emit;
}

function createExpander(plan: ExpandPlan): PetalExpander {
  const scratch = new Map<number, Uint8Array>();
  for (const [universe, len] of plan.bufferLen) scratch.set(universe, new Uint8Array(len));

  return {
    wrap(emit) {
      return (universe, bytes) => {
        emit(universe, bytes);
        const expanded = plan.bySource.get(universe);
        if (!expanded) return;
        for (const [expandedUniverse, ops] of expanded) {
          const buf = scratch.get(expandedUniverse)!;
          buf.fill(0);
          for (const { dst, src } of ops) {
            buf[dst] = bytes[src];
            buf[dst + 1] = bytes[src + 1];
            buf[dst + 2] = bytes[src + 2];
          }
          emit(expandedUniverse, buf);
        }
      };
    },
  };
}

export function createPetalExpander(config: PetalConfig): PetalExpander {
  return createExpander(buildExpandPlan(resolveSegments(config)));
}

const CONFIG_FILE = 'petal-config-v2.json';

export async function loadPetalExpander(pixelMapDir: string): Promise<PetalExpander | null> {
  let raw: string;
  try {
    raw = await readFile(join(pixelMapDir, CONFIG_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[runner] ${CONFIG_FILE} absent — rose petal expansion disabled`);
      return null;
    }
    throw err;
  }
  const parsed = petalConfig.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.warn(`[runner] ignoring malformed ${CONFIG_FILE}: ${parsed.error.message}`);
    return null;
  }
  return createPetalExpander(parsed.data);
}
