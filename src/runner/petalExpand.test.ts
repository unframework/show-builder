import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROSE_CELL_CHANNEL } from '../scene/zones';
import { createPetalExpander, type PetalConfig } from './petalExpand';

const CELLS = Object.keys(ROSE_CELL_CHANNEL);

// Counts sum past 170 so each petal spills into the second universe of its block,
// exercising the cross-universe split; skip_before leaves a dark passage.
const CONFIG: PetalConfig = {
  default_segments: CELLS.map((cell, i) => ({
    cell,
    count: 20,
    ...(i === 0 ? { skip_before: 2 } : {}),
  })),
};

// One source-universe buffer: petal p (1-based within the universe) cell c → a
// distinct RGB, matching roseWindow.ts channel packing (petalInUniv * 42 + cellOff).
function sourceBuffer(): Uint8Array {
  const buf = new Uint8Array(8 * 42);
  for (let petalInUniv = 0; petalInUniv < 8; petalInUniv++) {
    for (const offset of Object.values(ROSE_CELL_CHANNEL)) {
      const at = petalInUniv * 42 + offset;
      buf[at] = (petalInUniv + 1) * 10;
      buf[at + 1] = (offset / 3) * 15;
      buf[at + 2] = 77;
    }
  }
  return buf;
}

function capture(): { emit: (u: number, b: Uint8Array) => void; frames: Map<number, Uint8Array> } {
  const frames = new Map<number, Uint8Array>();
  return { emit: (u, b) => frames.set(u, Uint8Array.from(b)), frames };
}

function assertPetal(frames: Map<number, Uint8Array>, source: Uint8Array, petal: number): void {
  const firstUniverse = 76 + (petal - 1) * 4;
  const base = ((petal - 1) % 8) * 42;
  let led = 0;
  for (const seg of CONFIG.default_segments) {
    led += seg.skip_before ?? 0;
    const src = base + ROSE_CELL_CHANNEL[seg.cell];
    const expected = [source[src], source[src + 1], source[src + 2]];
    for (const k of [0, seg.count - 1]) {
      const l = led + k;
      const universe = firstUniverse + Math.floor(l / 170);
      const dst = (l % 170) * 3;
      const buf = frames.get(universe);
      assert.ok(buf, `expanded universe ${universe} emitted (petal ${petal})`);
      assert.deepEqual(
        [buf[dst], buf[dst + 1], buf[dst + 2]],
        expected,
        `petal ${petal} cell ${seg.cell} led ${l}`,
      );
    }
    led += seg.count;
  }
}

test('expands each cell color across its physical LEDs on the appended block', () => {
  const { emit, frames } = capture();
  const wrapped = createPetalExpander(CONFIG).wrap(emit);

  const u1 = sourceBuffer();
  const u2 = sourceBuffer();
  wrapped(1, u1);
  wrapped(2, u2);

  for (let petal = 1; petal <= 8; petal++) assertPetal(frames, u1, petal);
  for (let petal = 9; petal <= 16; petal++) assertPetal(frames, u2, petal);
});

test('passage LEDs before the first segment stay dark', () => {
  const { emit, frames } = capture();
  createPetalExpander(CONFIG).wrap(emit)(1, sourceBuffer());

  const u76 = frames.get(76)!;
  assert.deepEqual([u76[0], u76[1], u76[2]], [0, 0, 0]);
  assert.deepEqual([u76[3], u76[4], u76[5]], [0, 0, 0]);
});

test('source universes forward untouched and expanded universes stay in range', () => {
  const { emit, frames } = capture();
  const wrapped = createPetalExpander(CONFIG).wrap(emit);
  const u1 = sourceBuffer();
  wrapped(1, u1);
  wrapped(2, sourceBuffer());

  assert.deepEqual([...frames.get(1)!], [...u1]);
  for (const universe of frames.keys()) {
    if (universe === 1 || universe === 2) continue;
    assert.ok(universe >= 76 && universe <= 139, `expanded universe ${universe} within u76–u139`);
  }
});
