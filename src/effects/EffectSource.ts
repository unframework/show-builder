import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import { hslToRgb } from './color';
import {
  effectResumeState,
  type ControlState,
  type EffectEvent,
  type EffectParams,
  type EffectResumeState,
  type EffectSettings,
} from './controlMessages';
import {
  createDemoEffectContext,
  createDemoEffects,
  EFFECT_KNOBS,
  type DemoEffect,
  type DemoEffectContext,
  type DemoEffectId,
} from './demoEffects';
import { defaultKnobValues, kickCurve, resolveKnobs, type ResolvedKnobs } from './knobs';

type Emit = (universe: number, bytes: Uint8Array) => void;
type Listener = (event: EffectEvent) => void;

// Seed a live source from persisted knobs; running is applied last so its
// early-return can't be shadowed by an intermediate state.
export function applyEffectSettings(source: EffectSource, settings: EffectSettings): void {
  if (settings.effect) source.setEffect(settings.effect);
  if (settings.speed !== undefined) source.setSpeed(settings.speed);
  if (settings.brightness !== undefined) source.setBrightness(settings.brightness);
  if (settings.bpm !== undefined) source.setBpm(settings.bpm);
  if (settings.params) source.setParams(settings.params);
  if (settings.running !== undefined) source.setRunning(settings.running);
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

const EMPTY_KNOBS: ResolvedKnobs = {};

// A fresh copy so each emitted state has a new identity (React re-renders on it)
// and consumers can't mutate the engine's live knob values.
function cloneParams(params: EffectParams): EffectParams {
  const out: EffectParams = {};
  for (const [effect, knobs] of Object.entries(params)) {
    const copy: Record<string, { base: number; kick: number }> = {};
    for (const [key, v] of Object.entries(knobs)) copy[key] = { base: v.base, kick: v.kick };
    out[effect] = copy;
  }
  return out;
}

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
  private readonly params: EffectParams = {};
  private readonly phases: Record<string, Record<string, number>> = {};

  constructor(pixels: PixelDescriptor[], focus: Vec3, emit: Emit, resume?: ResumeState) {
    this.pixels = pixels;
    this.emit = emit;
    this.context = resume?.context ?? createDemoEffectContext();
    this.hslById = createDemoEffects(this.context, pixels, focus);
    this.hsl = this.hslById[this.effectId];

    for (const [id, schema] of Object.entries(EFFECT_KNOBS)) {
      if (!schema) continue;
      this.params[id] = defaultKnobValues(schema);
      const acc: Record<string, number> = {};
      for (const key in schema) if (schema[key].type === 'rate') acc[key] = 0;
      if (Object.keys(acc).length) this.phases[id] = acc;
    }

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
      params: cloneParams(this.params),
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
        params: this.params,
        phases: this.phases,
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
    if (state.params) this.mergeParams(state.params);
    if (state.phases) {
      for (const [effect, acc] of Object.entries(state.phases)) {
        const target = this.phases[effect];
        if (!target) continue;
        for (const [key, val] of Object.entries(acc)) {
          if (key in target) target[key] = val;
        }
      }
    }
  }

  private mergeParams(incoming: EffectParams): void {
    for (const [effect, knobs] of Object.entries(incoming)) {
      const target = this.params[effect];
      if (!target) continue;
      for (const [key, value] of Object.entries(knobs)) {
        if (target[key]) target[key] = { base: value.base, kick: value.kick };
      }
    }
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

  setParams(params: EffectParams): void {
    this.mergeParams(params);
    this.notify(this.getState());
  }

  setParam(effect: DemoEffectId, key: string, field: 'base' | 'kick', value: number): void {
    const knob = this.params[effect]?.[key];
    if (!knob || knob[field] === value) return;

    knob[field] = value;
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

  // Resolve the active effect's knobs for this frame: base + beat-kick, then
  // integrate any rate knobs into their running phase (advanced by dt·speed) and
  // expose that phase in place of the rate.
  private resolveActiveKnobs(dt: number): ResolvedKnobs {
    const schema = EFFECT_KNOBS[this.effectId];
    if (!schema) return EMPTY_KNOBS;
    const resolved = resolveKnobs(
      schema,
      this.params[this.effectId],
      kickCurve(this.beat, this.bpm),
    );
    const acc = this.phases[this.effectId];
    if (acc) {
      for (const key in schema) {
        if (schema[key].type === 'rate') {
          acc[key] += resolved[key] * dt * this.speed;
          resolved[key] = acc[key];
        }
      }
    }
    return resolved;
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
    const knobs = this.resolveActiveKnobs(dt);
    for (let i = 0; i < this.pixels.length; i++) {
      const p = this.pixels[i];
      const bytes = this.buffers.get(p.universe)!;
      if (!hsl) {
        bytes[p.ch0] = clampByte(p.base[0] * brightness);
        bytes[p.ch0 + 1] = clampByte(p.base[1] * brightness);
        bytes[p.ch0 + 2] = clampByte(p.base[2] * brightness);
        continue;
      }
      const [h, s, l] = hsl(
        {
          xn: p.xn,
          yn: p.yn,
          zn: p.zn,
          index: i,
          phase: this.phase,
          beat: this.beat,
          bpm: this.bpm,
          twinkleOffset: p.twinkleOffset,
        },
        knobs,
      );
      const [r, g, b] = hslToRgb(h, s, l);
      bytes[p.ch0] = clampByte(r * brightness);
      bytes[p.ch0 + 1] = clampByte(g * brightness);
      bytes[p.ch0 + 2] = clampByte(b * brightness);
    }

    for (const [universe, bytes] of this.buffers) this.emit(universe, bytes);
  }
}
