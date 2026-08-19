import * as THREE from 'three';
import type { Vec3 } from './coords';
import { DEMO_EFFECT_BY_ID, type DemoEffect, type DemoEffectId } from './demoEffects';
import type { PixelDescriptor } from './targets';

type Emit = (universe: number, bytes: Uint8Array) => void;

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Procedural frame source: the effect analogue of the relay. Iterates every
// pixel, evaluates the selected effect at the current phase, packs the result
// into 8-bit DMX universe buffers, and pushes them through the same ingest the
// relay uses. Runs on its own animation clock while active.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly focus: Vec3;
  private readonly emit: Emit;
  private readonly buffers = new Map<number, Uint8Array>();
  private readonly color = new THREE.Color();

  private effect: DemoEffect = DEMO_EFFECT_BY_ID.get('zone')!;
  private speed = 1;
  private phase = 0;
  private lastTs: number | null = null;
  private frameHandle = 0;

  constructor(pixels: PixelDescriptor[], focus: Vec3, emit: Emit) {
    this.pixels = pixels;
    this.focus = focus;
    this.emit = emit;

    const length = new Map<number, number>();
    for (const p of pixels) {
      const need = p.ch0 + 3;
      length.set(p.universe, Math.max(length.get(p.universe) ?? 0, need));
    }
    for (const [universe, len] of length) this.buffers.set(universe, new Uint8Array(len));
  }

  setEffect(id: DemoEffectId): void {
    const effect = DEMO_EFFECT_BY_ID.get(id);
    if (effect) this.effect = effect;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  start(): void {
    if (this.frameHandle) return;
    this.lastTs = null;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private tick = (ts: number): void => {
    this.frameHandle = requestAnimationFrame(this.tick);
    if (this.lastTs !== null) this.phase += ((ts - this.lastTs) / 1000) * this.speed;
    this.lastTs = ts;

    const { hsl } = this.effect;
    for (const p of this.pixels) {
      const bytes = this.buffers.get(p.universe)!;
      if (!hsl) {
        bytes[p.ch0] = clampByte(p.base[0]);
        bytes[p.ch0 + 1] = clampByte(p.base[1]);
        bytes[p.ch0 + 2] = clampByte(p.base[2]);
        continue;
      }
      const [h, s, l] = hsl({
        xn: p.xn,
        yn: p.yn,
        zn: p.zn,
        phase: this.phase,
        twinkleOffset: p.twinkleOffset,
        focus: this.focus,
      });
      this.color.setHSL(h, s, l);
      bytes[p.ch0] = clampByte(this.color.r);
      bytes[p.ch0 + 1] = clampByte(this.color.g);
      bytes[p.ch0 + 2] = clampByte(this.color.b);
    }

    for (const [universe, bytes] of this.buffers) this.emit(universe, bytes);
  };
}
