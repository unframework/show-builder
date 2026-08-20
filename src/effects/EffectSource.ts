import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import { hslToRgb } from './color';
import type { ControlState, EffectEvent } from './controlMessages';
import { DEMO_EFFECT_BY_ID, type DemoEffect, type DemoEffectId } from './demoEffects';

type Emit = (universe: number, bytes: Uint8Array) => void;
type Listener = (event: EffectEvent) => void;

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Avoid double-flash when re-cueing the beat this close to the downbeat.
const CUE_NUDGE_MAX_SEC = 0.2;

// Procedural frame source: the effect analogue of the relay. Iterates every
// pixel, evaluates the selected effect at the current phase, packs the result
// into 8-bit DMX universe buffers, and pushes them through the same ingest the
// relay uses. Environment-agnostic: a driver advances it via `renderFrame`.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly focus: Vec3;
  private readonly emit: Emit;
  private readonly buffers = new Map<number, Uint8Array>();
  private readonly listeners = new Set<Listener>();

  private effect: DemoEffect = DEMO_EFFECT_BY_ID.get('zone')!;
  private effectId: DemoEffectId = 'zone';
  private running = true;
  private speed = 1;
  private phase = 0;
  private bpm = 120;
  private beat = 0;
  private beatNudge = 0;

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

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ControlState {
    return {
      type: 'state',
      effect: this.effectId,
      running: this.running,
      speed: this.speed,
      bpm: this.bpm,
    };
  }

  private notify(event: EffectEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  setEffect(id: DemoEffectId): void {
    const effect = DEMO_EFFECT_BY_ID.get(id);
    if (!effect || id === this.effectId) return;

    this.effect = effect;
    this.effectId = id;
    this.notify(this.getState());
  }

  setRunning(running: boolean): void {
    if (running === this.running) return;

    this.running = running;
    this.notify(this.getState());
  }

  setSpeed(speed: number): void {
    if (speed === this.speed) return;

    this.speed = speed;
    this.notify(this.getState());
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm === this.bpm) return;

    this.bpm = bpm;
    this.notify(this.getState());
  }

  cueBeat(): void {
    const error = this.beat - Math.round(this.beat);
    if (error > 0 && (error * 60) / this.bpm <= CUE_NUDGE_MAX_SEC) {
      // Downbeat just fired: ease onto the tapped grid so we don't re-fire.
      this.beatNudge = -error;
    } else {
      // About to happen, or long enough since the last: hit the downbeat now.
      this.beat = 0;
      this.beatNudge = 0;
    }
  }

  renderFrame(dt: number): void {
    const advance = (dt * this.bpm) / 60;
    const ease = this.beatNudge * Math.min(1, advance);
    this.beatNudge -= ease;
    const prevBeat = Math.floor(this.beat);
    this.beat += advance + ease;
    const beat = Math.floor(this.beat);

    if (beat > prevBeat) this.notify({ type: 'beat', beat });

    if (!this.running) return;

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
        beat: this.beat,
        bpm: this.bpm,
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
