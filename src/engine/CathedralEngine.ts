import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ROSE_CENTER_WORLD } from '../scene/build/roseWindow';
import type { Vec3 } from '../scene/coords';
import type { PixelMap } from '../scene/pixelData';
import { runBuilders } from '../scene/runBuilders';
import { SceneBuilder } from './SceneBuilder';
import {
  normalizePoint,
  normalizeTargets,
  resetToZoneColors,
  toPixelDescriptors,
  updateLiveColors,
  type Bounds,
  type LedTarget,
  type PixelDescriptor,
} from './targets';
import { ROSE_CELL_CHANNEL, ZONE_DEFS, type ZoneId } from '../scene/zones';

export interface RoseCellUpdate {
  petal: number;
  cell: string;
  r: number;
  g: number;
  b: number;
}

const ROSE_PETAL_CHANNELS = 42;

export class CathedralEngine {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly groups: Record<ZoneId, THREE.Group>;
  private readonly targets: LedTarget[];

  private readonly liveChannels = new Map<number, Uint8Array>();
  private readonly bounds: Bounds;

  private frameHandle = 0;

  constructor(container: HTMLElement, pixelMap: PixelMap) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07070f);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(-15, 30, -20);
    this.scene.add(sun);
    this.scene.add(new THREE.GridHelper(100, 50, 0x181828, 0x0d0d1a));

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(55, w / h || 1, 0.1, 500);
    this.camera.position.set(-20, 18, -35);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 8, 2);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 200;
    this.controls.update();

    this.renderer.domElement.addEventListener('dblclick', this.resetView);

    const builder = new SceneBuilder();
    runBuilders(builder, pixelMap);

    this.groups = builder.groups;
    this.targets = builder.targets;
    for (const z of ZONE_DEFS) this.scene.add(this.groups[z.id]);
    this.bounds = normalizeTargets(this.targets);

    this.resize();
    this.frameHandle = requestAnimationFrame(this.animate);
  }

  setZoneVisible(id: ZoneId, visible: boolean): void {
    this.groups[id].visible = visible;
  }

  getPixels(): PixelDescriptor[] {
    return toPixelDescriptors(this.targets);
  }

  getFocus(): Vec3 {
    return normalizePoint(ROSE_CENTER_WORLD, this.bounds);
  }

  applyUniverse(universe: number, channels: ArrayLike<number>): void {
    this.liveChannels.set(universe, Uint8Array.from(channels));
  }

  applyRoseCells(cells: RoseCellUpdate[]): void {
    for (const { petal, cell, r, g, b } of cells) {
      const universe = petal + 1;
      let chs = this.liveChannels.get(universe);
      if (!chs) {
        chs = new Uint8Array(ROSE_PETAL_CHANNELS);
        this.liveChannels.set(universe, chs);
      }
      const ch0 = ROSE_CELL_CHANNEL[cell];
      if (ch0 !== undefined) {
        chs[ch0] = r;
        chs[ch0 + 1] = g;
        chs[ch0 + 2] = b;
      }
    }
  }

  clearLive(): void {
    this.liveChannels.clear();
    resetToZoneColors(this.targets);
  }

  resize = (): void => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h || 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    this.renderer.domElement.removeEventListener('dblclick', this.resetView);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resetView = (): void => {
    this.camera.position.set(0, 18, -35);
    this.controls.target.set(0, 8, 0);
    this.controls.update();
  };

  private animate = (): void => {
    this.frameHandle = requestAnimationFrame(this.animate);
    this.controls.update();
    updateLiveColors(this.targets, this.liveChannels);
    this.renderer.render(this.scene, this.camera);
  };
}
