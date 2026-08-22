import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import { hslToRgb } from './color';
import {
  effectResumeState,
  type ControlState,
  type EffectEvent,
  type EffectResumeState,
  type EffectSettings,
} from './controlMessages';
import {
  createDemoEffectContext,
  createDemoEffects,
  type DemoEffect,
  type DemoEffectContext,
  type DemoEffectId,
} from './demoEffects';

type Emit = (universe: number, bytes: Uint8Array) => void;
type Listener = (event: EffectEvent) => void;

// Seed a live source from persisted knobs; running is applied last so its
// early-return can't be shadowed by an intermediate state.
export function applyEffectSettings(source: EffectSource, settings: EffectSettings): void {
  if (settings.effect) source.setEffect(settings.effect);
  if (settings.speed !== undefined) source.setSpeed(settings.speed);
  if (settings.brightness !== undefined) source.setBrightness(settings.brightness);
  if (settings.bpm !== undefined) source.setBpm(settings.bpm);
  if (settings.running !== undefined) source.setRunning(settings.running);
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

// Avoid double-flash when re-cueing the beat this close to the downbeat.
const CUE_NUDGE_MAX_SEC = 0.2;

// Everything needed to continue an engine in place across a dev hot reload: the
// serializable animation snapshot plus the live context to reuse (so noise
// fields aren't reseeded). Opaque to callers — produced by getResumeState,
// consumed by the constructor.
export interface ResumeState {
  snapshot: EffectResumeState;
  context: DemoEffectContext;
}

// Procedural frame source: the effect analogue of the relay. Iterates every
// pixel, evaluates the selected effect at the current phase, packs the result
// into 8-bit DMX universe buffers, and pushes them through the same ingest the
// relay uses. Environment-agnostic: a driver advances it via `renderFrame`.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly emit: Emit;
  private readonly buffers = new Map<number, Uint8Array>();
  private readonly listeners = new Set<Listener>();
  private readonly context: DemoEffectContext;
  private readonly hslById: Record<DemoEffectId, DemoEffect['hsl']>;

  private hsl: DemoEffect['hsl'];
  private effectId: DemoEffectId = 'zone';
  private running = true;
  private speed = 1;
  private brightness = 1;
  private phase = 0;
  private bpm = 120;
  private beat = 0;
  private beatNudge = 0;

  constructor(pixels: PixelDescriptor[], focus: Vec3, emit: Emit, resume?: ResumeState) {
    this.pixels = pixels;
    this.emit = emit;
    this.context = resume?.context ?? createDemoEffectContext();
    this.hslById = createDemoEffects(this.context, pixels, focus);
    this.hsl = this.hslById[this.effectId];

    const length = new Map<number, number>();
    for (const p of pixels) {
      const need = p.ch0 + 3;
      length.set(p.universe, Math.max(length.get(p.universe) ?? 0, need));
    }
    for (const [universe, len] of length) this.buffers.set(universe, new Uint8Array(len));

    if (resume?.snapshot !== undefined) this.restore(resume.snapshot);
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
      brightness: this.brightness,
      bpm: this.bpm,
    };
  }

  getResumeState(): ResumeState {
    return {
      snapshot: {
        effect: this.effectId,
        running: this.running,
        speed: this.speed,
        brightness: this.brightness,
        bpm: this.bpm,
        phase: this.phase,
        beat: this.beat + this.beatNudge,
      },
      context: this.context,
    };
  }

  private restore(snapshot: unknown): void {
    const parsed = effectResumeState.safeParse(snapshot);
    if (!parsed.success) return;
    const state = parsed.data;

    this.effectId = state.effect;
    this.hsl = this.hslById[state.effect];
    this.running = state.running;
    this.speed = state.speed;
    this.brightness = state.brightness;
    this.bpm = state.bpm;
    this.phase = state.phase;
    this.beat = state.beat;
    this.beatNudge = 0;
  }

  private notify(event: EffectEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  setEffect(id: DemoEffectId): void {
    if (id === this.effectId) return;

    this.effectId = id;
    this.hsl = this.hslById[id];
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

  setBrightness(brightness: number): void {
    if (brightness === this.brightness) return;

    this.brightness = brightness;
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

    const hsl = this.hsl;
    const brightness = this.brightness;
    for (let i = 0; i < this.pixels.length; i++) {
      const p = this.pixels[i];
      const bytes = this.buffers.get(p.universe)!;
      if (!hsl) {
        bytes[p.ch0] = clampByte(p.base[0] * brightness);
        bytes[p.ch0 + 1] = clampByte(p.base[1] * brightness);
        bytes[p.ch0 + 2] = clampByte(p.base[2] * brightness);
        continue;
      }
      const [h, s, l] = hsl({
        xn: p.xn,
        yn: p.yn,
        zn: p.zn,
        index: i,
        phase: this.phase,
        beat: this.beat,
        bpm: this.bpm,
        twinkleOffset: p.twinkleOffset,
      });
      const [r, g, b] = hslToRgb(h, s, l);
      bytes[p.ch0] = clampByte(r * brightness);
      bytes[p.ch0 + 1] = clampByte(g * brightness);
      bytes[p.ch0 + 2] = clampByte(b * brightness);
    }

    for (const [universe, bytes] of this.buffers) this.emit(universe, bytes);
  }
}
