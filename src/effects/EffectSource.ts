import type { Vec3 } from '../engine/coords';
import type { PixelDescriptor } from '../engine/targets';
import { hslToRgb } from './color';
import { DEMO_EFFECT_BY_ID, type DemoEffect, type DemoEffectId } from './demoEffects';

type Emit = (universe: number, bytes: Uint8Array) => void;

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Procedural frame source: the effect analogue of the relay. Iterates every
// pixel, evaluates the selected effect at the current phase, packs the result
// into 8-bit DMX universe buffers, and pushes them through the same ingest the
// relay uses. Environment-agnostic: a driver advances it via `renderFrame`.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly focus: Vec3;
  private readonly emit: Emit;
  private readonly buffers = new Map<number, Uint8Array>();

  private effect: DemoEffect = DEMO_EFFECT_BY_ID.get('zone')!;
  private speed = 1;
  private phase = 0;

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

  renderFrame(dt: number): void {
    this.phase += dt * this.speed;

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
      const [r, g, b] = hslToRgb(h, s, l);
      bytes[p.ch0] = clampByte(r);
      bytes[p.ch0 + 1] = clampByte(g);
      bytes[p.ch0 + 2] = clampByte(b);
    }

    for (const [universe, bytes] of this.buffers) this.emit(universe, bytes);
  }
}
