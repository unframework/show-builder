import * as THREE from 'three';
import { CHANNELS_PER_UNIVERSE, type Vec3 } from './coords';
import type { LedTarget } from './targets';
import { ZONE_DEFS, type ZoneId } from './zones';

function circleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export class SceneBuilder {
  readonly groups: Record<ZoneId, THREE.Group>;
  readonly targets: LedTarget[] = [];
  private readonly colors: Record<ZoneId, THREE.Color>;
  private readonly circle = circleTexture();

  constructor() {
    this.groups = {} as Record<ZoneId, THREE.Group>;
    this.colors = {} as Record<ZoneId, THREE.Color>;
    for (const z of ZONE_DEFS) {
      this.groups[z.id] = new THREE.Group();
      this.colors[z.id] = new THREE.Color(z.hex);
    }
  }

  zoneColor(id: ZoneId): THREE.Color {
    return this.colors[id];
  }

  add(id: ZoneId, obj: THREE.Object3D): void {
    this.groups[id].add(obj);
  }

  meshTarget(
    material: THREE.MeshBasicMaterial,
    universe: number,
    ch0: number,
    base: THREE.Color,
    world: Vec3,
  ): void {
    this.targets.push({
      kind: 'mesh',
      material,
      universe,
      ch0,
      base,
      world,
      xn: 0,
      yn: 0,
      zn: 0,
      twinkleOffset: 0,
    });
  }

  // A Points cloud with per-vertex colors tracked for live/demo updates.
  // Pixel i occupies channels [startCh1-1 + 3i ..], rolling into universe+1 every
  // 170 pixels (510 channels), matching xLights / F48V5 packing.
  trackedPoints(
    positions: Vec3[],
    universe: number,
    startCh1: number,
    color: THREE.Color,
    circular = false,
    size = 0.35,
  ): THREE.Object3D {
    const n = positions.length;
    if (n === 0) return new THREE.Group();

    const posArr = new Float32Array(n * 3);
    const colArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      posArr[i * 3] = positions[i][0];
      posArr[i * 3 + 1] = positions[i][1];
      posArr[i * 3 + 2] = positions[i][2];
      colArr[i * 3] = color.r;
      colArr[i * 3 + 1] = color.g;
      colArr[i * 3 + 2] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    const colors = new THREE.Float32BufferAttribute(colArr, 3);
    colors.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('color', colors);

    const ch0base = startCh1 - 1;
    for (let i = 0; i < n; i++) {
      const absOff = ch0base + i * 3;
      this.targets.push({
        kind: 'point',
        colors,
        index: i,
        universe: universe + Math.floor(absOff / CHANNELS_PER_UNIVERSE),
        ch0: absOff % CHANNELS_PER_UNIVERSE,
        base: color,
        world: positions[i],
        xn: 0,
        yn: 0,
        zn: 0,
        twinkleOffset: 0,
      });
    }

    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        vertexColors: true,
        ...(circular ? { map: this.circle, alphaTest: 0.5 } : {}),
      }),
    );
  }

  // Arch pixel_positions are [spanCoord, catY]; span/fixed map to Three.js X/Z.
  archPoints(
    pixelPositions: [number, number][],
    spanAxis: 'x' | 'z',
    fixedValue: number,
    universe: number,
    startCh1: number,
    color: THREE.Color,
  ): THREE.Object3D {
    const positions: Vec3[] = pixelPositions.map(([a, b]) =>
      spanAxis === 'z' ? [-a, b, fixedValue] : [-fixedValue, b, a],
    );
    return this.trackedPoints(positions, universe, startCh1, color, false, 0.25);
  }
}
