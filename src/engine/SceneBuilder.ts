import * as THREE from 'three';
import type { Vec3 } from '../scene/coords';
import type { Led, LedScene, PointStyle } from '../scene/ledScene';
import type { LedTarget } from './targets';
import { SPIRELET_HEIGHT, SPIRELET_RADIUS } from '../scene/build/spirelets';
import { ZONE_DEFS, type ZoneId } from '../scene/zones';

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

// The Three.js backend for the geometry builders: turns emitted LEDs into render
// objects grouped by zone, and records a paintable LedTarget per pixel.
export class SceneBuilder implements LedScene {
  readonly groups: Record<ZoneId, THREE.Group>;
  readonly targets: LedTarget[] = [];
  private readonly colors: Record<ZoneId, THREE.Color>;
  private readonly circle = circleTexture();
  private readonly coneGeo = new THREE.ConeGeometry(SPIRELET_RADIUS, SPIRELET_HEIGHT, 3, 1);

  constructor() {
    this.groups = {} as Record<ZoneId, THREE.Group>;
    this.colors = {} as Record<ZoneId, THREE.Color>;
    for (const z of ZONE_DEFS) {
      this.groups[z.id] = new THREE.Group();
      this.colors[z.id] = new THREE.Color(z.hex);
    }
  }

  mesh(zone: ZoneId, outline: [number, number][], origin: Vec3, led: Led): void {
    const color = this.colors[zone];
    const shape = new THREE.Shape();
    outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));

    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
    mesh.position.set(origin[0], origin[1], origin[2]);
    this.groups[zone].add(mesh);
    this.pushMesh(mat, color, led);
  }

  cone(zone: ZoneId, led: Led): void {
    const color = this.colors[zone];
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const cone = new THREE.Mesh(this.coneGeo, mat);
    cone.position.set(led.world[0], led.world[1], led.world[2]);
    this.groups[zone].add(cone);
    this.pushMesh(mat, color, led);
  }

  // A Points cloud with per-vertex colors tracked for live/demo updates.
  points(zone: ZoneId, leds: Led[], style: PointStyle): void {
    const n = leds.length;
    if (n === 0) return;
    const color = this.colors[zone];

    const posArr = new Float32Array(n * 3);
    const colArr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const w = leds[i].world;
      posArr[i * 3] = w[0];
      posArr[i * 3 + 1] = w[1];
      posArr[i * 3 + 2] = w[2];
      colArr[i * 3] = color.r;
      colArr[i * 3 + 1] = color.g;
      colArr[i * 3 + 2] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    const colors = new THREE.Float32BufferAttribute(colArr, 3);
    colors.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('color', colors);

    for (let i = 0; i < n; i++) {
      const led = leds[i];
      this.targets.push({
        kind: 'point',
        colors,
        index: i,
        universe: led.universe,
        ch0: led.ch0,
        base: color,
        world: led.world,
        xn: 0,
        yn: 0,
        zn: 0,
        twinkleOffset: 0,
      });
    }

    this.groups[zone].add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: style.size,
          sizeAttenuation: true,
          vertexColors: true,
          ...(style.circular ? { map: this.circle, alphaTest: 0.5 } : {}),
        }),
      ),
    );
  }

  line(zone: ZoneId, path: Vec3[]): void {
    const pts = path.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.groups[zone].add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: this.colors[zone], transparent: true, opacity: 0.35 }),
      ),
    );
  }

  private pushMesh(material: THREE.MeshBasicMaterial, base: THREE.Color, led: Led): void {
    this.targets.push({
      kind: 'mesh',
      material,
      universe: led.universe,
      ch0: led.ch0,
      base,
      world: led.world,
      xn: 0,
      yn: 0,
      zn: 0,
      twinkleOffset: 0,
    });
  }
}
