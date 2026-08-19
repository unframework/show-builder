import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildMainArches, buildMiniArches, buildQuadArches } from './build/arches';
import { buildCanopy } from './build/canopy';
import { buildRoseWindow } from './build/roseWindow';
import { buildSpirelets } from './build/spirelets';
import { buildSpires } from './build/spires';
import { DEMO_EFFECT_BY_ID, type DemoEffect, type DemoEffectId } from './demoEffects';
import type { PixelMap } from './pixelData';
import { SceneBuilder } from './SceneBuilder';
import {
  normalizeTargets,
  resetToZoneColors,
  updateDemoColors,
  updateLiveColors,
  type LedTarget,
} from './targets';
import { ROSE_CELL_CHANNEL, ZONE_DEFS, type ZoneId } from './zones';

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
  private readonly tmpColor = new THREE.Color();

  private effect: DemoEffect = DEMO_EFFECT_BY_ID.get('zone')!;
  private demoSpeed = 1;
  private liveActive = false;
  private phase = 0;
  private lastTs: number | null = null;
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
    buildRoseWindow(builder, pixelMap.cellPolygons);
    buildMainArches(builder, pixelMap.mainArches);
    buildMiniArches(builder, pixelMap.miniLeft, pixelMap.miniRight);
    buildQuadArches(builder, pixelMap.quads);
    buildSpires(builder, pixelMap.spires);
    buildSpirelets(builder, pixelMap.spirelets);
    buildCanopy(builder, pixelMap.canopy);

    this.groups = builder.groups;
    this.targets = builder.targets;
    for (const z of ZONE_DEFS) this.scene.add(this.groups[z.id]);
    normalizeTargets(this.targets);

    this.resize();
    this.frameHandle = requestAnimationFrame(this.animate);
  }

  setZoneVisible(id: ZoneId, visible: boolean): void {
    this.groups[id].visible = visible;
  }

  setDemoEffect(id: DemoEffectId): void {
    const effect = DEMO_EFFECT_BY_ID.get(id);
    if (effect) this.effect = effect;
  }

  setDemoSpeed(speed: number): void {
    this.demoSpeed = speed;
  }

  applyUniverse(universe: number, channels: ArrayLike<number>): void {
    this.liveChannels.set(universe, Uint8Array.from(channels));
    this.liveActive = true;
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
    this.liveActive = true;
  }

  clearLive(): void {
    this.liveChannels.clear();
    this.liveActive = false;
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

  private animate = (ts: number): void => {
    this.frameHandle = requestAnimationFrame(this.animate);
    if (!this.liveActive && this.lastTs !== null) {
      this.phase += ((ts - this.lastTs) / 1000) * this.demoSpeed;
    }
    this.lastTs = ts;
    this.controls.update();
    if (this.liveActive) updateLiveColors(this.targets, this.liveChannels);
    else updateDemoColors(this.targets, this.effect, this.phase, this.tmpColor);
    this.renderer.render(this.scene, this.camera);
  };
}
