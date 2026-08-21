import type { Vec3 } from './coords';
import type { ZoneId } from './zones';

// A frame source's view of one LED: its DMX address, normalized position, and
// resting zone color — everything an effect needs, minus the Three.js object.
export interface PixelDescriptor {
  universe: number;
  ch0: number;
  xn: number;
  yn: number;
  zn: number;
  twinkleOffset: number;
  base: [number, number, number];
  zone: ZoneId;
  segment: string;
}

export interface Bounds {
  lo: Vec3;
  span: Vec3;
}

export function normalizePoint(world: Vec3, { lo, span }: Bounds): Vec3 {
  return [(world[0] - lo[0]) / span[0], (world[1] - lo[1]) / span[1], (world[2] - lo[2]) / span[2]];
}

export function computeBounds(points: Vec3[]): Bounds {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p[a]);
      hi[a] = Math.max(hi[a], p[a]);
    }
  }
  const span: Vec3 = [hi[0] - lo[0] || 1, hi[1] - lo[1] || 1, hi[2] - lo[2] || 1];
  return { lo, span };
}
