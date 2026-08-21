import * as THREE from 'three';
import type { Vec3 } from '../scene/coords';
import type { ZoneId } from '../scene/zones';
import {
  computeBounds,
  normalizePoint,
  type Bounds,
  type PixelDescriptor,
} from '../scene/normalize';

export { normalizePoint, computeBounds } from '../scene/normalize';
export type { Bounds, PixelDescriptor } from '../scene/normalize';

// A single addressable LED, either a vertex in a Points cloud or a whole mesh's
// material. `ch0` is its 0-based channel offset within `universe`.
interface LedTargetBase {
  universe: number;
  ch0: number;
  base: THREE.Color;
  world: Vec3;
  xn: number;
  yn: number;
  zn: number;
  twinkleOffset: number;
  zone: ZoneId;
  segment: string;
}

export interface PointTarget extends LedTargetBase {
  kind: 'point';
  colors: THREE.BufferAttribute;
  index: number;
}

export interface MeshTarget extends LedTargetBase {
  kind: 'mesh';
  material: THREE.MeshBasicMaterial;
}

export type LedTarget = PointTarget | MeshTarget;

export function toPixelDescriptors(targets: LedTarget[]): PixelDescriptor[] {
  return targets.map((t) => ({
    universe: t.universe,
    ch0: t.ch0,
    xn: t.xn,
    yn: t.yn,
    zn: t.zn,
    twinkleOffset: t.twinkleOffset,
    base: [t.base.r, t.base.g, t.base.b],
    zone: t.zone,
    segment: t.segment,
  }));
}

function paint(
  target: LedTarget,
  r: number,
  g: number,
  b: number,
  dirty: Set<THREE.BufferAttribute>,
): void {
  if (target.kind === 'point') {
    target.colors.setXYZ(target.index, r, g, b);
    dirty.add(target.colors);
  } else {
    target.material.color.setRGB(r, g, b);
  }
}

export function normalizeTargets(targets: LedTarget[]): Bounds {
  const bounds = computeBounds(targets.map((t) => t.world));
  for (const t of targets) {
    [t.xn, t.yn, t.zn] = normalizePoint(t.world, bounds);
    t.twinkleOffset = Math.random() * Math.PI * 2;
  }
  return bounds;
}

export function updateLiveColors(
  targets: LedTarget[],
  liveChannels: Map<number, Uint8Array>,
): void {
  const dirty = new Set<THREE.BufferAttribute>();
  for (const t of targets) {
    const chs = liveChannels.get(t.universe);
    if (!chs || t.ch0 + 2 >= chs.length) continue;
    paint(t, chs[t.ch0] / 255, chs[t.ch0 + 1] / 255, chs[t.ch0 + 2] / 255, dirty);
  }
  for (const buf of dirty) buf.needsUpdate = true;
}

export function resetToZoneColors(targets: LedTarget[]): void {
  const dirty = new Set<THREE.BufferAttribute>();
  for (const t of targets) paint(t, t.base.r, t.base.g, t.base.b, dirty);
  for (const buf of dirty) buf.needsUpdate = true;
}
