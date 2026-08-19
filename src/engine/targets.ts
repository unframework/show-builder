import * as THREE from 'three';
import type { Vec3 } from './coords';
import type { DemoEffect } from './demoEffects';

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

export function normalizeTargets(targets: LedTarget[]): void {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const t of targets) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], t.world[a]);
      hi[a] = Math.max(hi[a], t.world[a]);
    }
  }
  const span: Vec3 = [hi[0] - lo[0] || 1, hi[1] - lo[1] || 1, hi[2] - lo[2] || 1];
  for (const t of targets) {
    t.xn = (t.world[0] - lo[0]) / span[0];
    t.yn = (t.world[1] - lo[1]) / span[1];
    t.zn = (t.world[2] - lo[2]) / span[2];
    t.twinkleOffset = Math.random() * Math.PI * 2;
  }
}

export function updateDemoColors(
  targets: LedTarget[],
  effect: DemoEffect,
  phase: number,
  tmp: THREE.Color,
): void {
  const dirty = new Set<THREE.BufferAttribute>();
  for (const t of targets) {
    if (!effect.hsl) {
      paint(t, t.base.r, t.base.g, t.base.b, dirty);
      continue;
    }
    const [h, s, l] = effect.hsl({
      xn: t.xn,
      yn: t.yn,
      zn: t.zn,
      phase,
      twinkleOffset: t.twinkleOffset,
    });
    tmp.setHSL(h, s, l);
    paint(t, tmp.r, tmp.g, tmp.b, dirty);
  }
  for (const buf of dirty) buf.needsUpdate = true;
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
