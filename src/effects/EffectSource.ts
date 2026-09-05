import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import {
  effectResumeState,
  type ControlState,
  type EffectEvent,
  type EffectParams,
  type EffectResumeState,
  type EffectSettings,
  type Preset,
  type PresetsEvent,
  type Slots,
} from './controlMessages';
import { snapshotSignature } from '../controlHistory';
import { emptySlots, normalizeSlots, type PresetsFile } from './presets';
import {
  createDemoEffectContext,
  createDemoEffects,
  EFFECT_KNOBS,
  EFFECT_RAMPS,
  type DemoEffectContext,
  type DemoEffectId,
} from './demoEffects';
import { paintLayers, type Layer, type LayerRuntime, type LayerState } from './layers';
import { defaultKnobValues, kickCurve, resolveKnobs, type KnobValues } from './knobs';
import type { Ramp } from './stages';

export type FrameSink = (universe: number, rgb: Float64Array, brightness: number) => void;
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

// A fresh copy so each emitted state has a new identity (React re-renders on it)
// and consumers can't mutate the engine's live knob values.
function cloneParams(params: EffectParams): EffectParams {
  const out: EffectParams = {};
  for (const [effect, layers] of Object.entries(params)) {
    const layerCopy: Record<string, LayerState> = {};
    for (const [layer, st] of Object.entries(layers)) {
      const knobs: KnobValues = {};
      for (const [key, v] of Object.entries(st.knobs)) knobs[key] = { ...v };
      layerCopy[layer] = st.ramp ? { knobs, ramp: st.ramp } : { knobs };
    }
    out[effect] = layerCopy;
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
// pixel, evaluates the selected effect at the current phase, and emits a
// per-universe float RGB buffer plus the master brightness. Brightness and 8-bit
// quantization happen downstream in the output stage. Environment-agnostic: a
// driver advances it via `renderFrame`.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly emit: FrameSink;
  private readonly buffers = new Map<number, Float64Array>();
  private readonly listeners = new Set<Listener>();
  private readonly context: DemoEffectContext;
  private readonly layersById: Record<DemoEffectId, Layer[] | undefined>;

  private layers: Layer[] | undefined;
  private effectId: DemoEffectId = 'zone';
  private running = true;
  private speed = 1;
  private brightness = 1;
  private phase = 0;
  private bpm = 120;
  private beat = 0;
  private beatNudge = 0;
  private readonly params: EffectParams = {};
  private readonly phases: Record<string, Record<string, Record<string, number>>> = {};

  private slots: Slots = emptySlots();
  private active: number | null = null;
  private armed: number | null = null;

  constructor(pixels: PixelDescriptor[], focus: Vec3, emit: FrameSink, resume?: ResumeState) {
    this.pixels = pixels;
    this.emit = emit;
    this.context = resume?.context ?? createDemoEffectContext();
    this.layersById = createDemoEffects(this.context, pixels, focus);
    this.layers = this.layersById[this.effectId];

    for (const [id, schema] of Object.entries(EFFECT_KNOBS)) {
      if (!schema) continue;
      const ramps = EFFECT_RAMPS[id as DemoEffectId];
      const layers: Record<string, LayerState> = {};
      const acc: Record<string, Record<string, number>> = {};
      for (const [layer, knobs] of Object.entries(schema)) {
        const ramp = ramps?.[layer];
        layers[layer] = ramp
          ? { knobs: defaultKnobValues(knobs), ramp }
          : { knobs: defaultKnobValues(knobs) };
        const layerAcc: Record<string, number> = {};
        for (const key in knobs) {
          const t = knobs[key].type;
          if (t === 'rate' || t === 'beatRatio') layerAcc[key] = 0;
        }
        if (Object.keys(layerAcc).length) acc[layer] = layerAcc;
      }
      this.params[id] = layers;
      if (Object.keys(acc).length) this.phases[id] = acc;
    }

    const length = new Map<number, number>();
    for (const p of pixels) {
      const need = p.ch0 + 3;
      length.set(p.universe, Math.max(length.get(p.universe) ?? 0, need));
    }
    for (const [universe, len] of length) this.buffers.set(universe, new Float64Array(len));

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
      layers: (this.layers ?? []).map((l) => ({ name: l.name, blend: l.blend, ramp: l.ramp })),
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
    this.layers = this.layersById[state.effect];
    this.running = state.running;
    this.speed = state.speed;
    this.brightness = state.brightness;
    this.bpm = state.bpm;
    this.phase = state.phase;
    this.beat = state.beat;
    this.beatNudge = 0;
    if (state.params) this.mergeParams(state.params);
    if (state.phases) {
      for (const [effect, layers] of Object.entries(state.phases)) {
        const target = this.phases[effect];
        if (!target) continue;
        for (const [layer, acc] of Object.entries(layers)) {
          const layerAcc = target[layer];
          if (!layerAcc) continue;
          for (const [key, val] of Object.entries(acc)) if (key in layerAcc) layerAcc[key] = val;
        }
      }
    }
  }

  private mergeParams(incoming: EffectParams): void {
    for (const [effect, layers] of Object.entries(incoming)) {
      const target = this.params[effect];
      if (!target) continue;
      for (const [layer, st] of Object.entries(layers)) {
        const tl = target[layer];
        if (!tl) continue;
        for (const [key, value] of Object.entries(st.knobs)) {
          const current = tl.knobs[key];
          // Drop values whose shape no longer matches the knob's type (a knob that
          // switched between scalar and beatRatio across versions); keep the default.
          if (current && 'num' in current === 'num' in value) tl.knobs[key] = { ...value };
        }
        if (st.ramp) tl.ramp = st.ramp;
      }
    }
  }

  private notify(event: EffectEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  setEffect(id: DemoEffectId): void {
    if (id === this.effectId) return;

    this.effectId = id;
    this.layers = this.layersById[id];
    this.notify(this.getState());
    this.commitActive();
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
    this.commitActive();
  }

  setParam(
    effect: DemoEffectId,
    layer: string,
    key: string,
    field: 'base' | 'kick' | 'num' | 'den',
    value: number,
  ): void {
    const knob = this.params[effect]?.[layer]?.knobs[key] as Record<string, number> | undefined;
    if (!knob || knob[field] === value) return;

    knob[field] = value;
    this.notify(this.getState());
    this.commitActive();
  }

  setRamp(effect: DemoEffectId, layer: string, ramp: Ramp): void {
    const state = this.params[effect]?.[layer];
    if (!state) return;

    state.ramp = ramp;
    this.notify(this.getState());
    this.commitActive();
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

  getPresets(): PresetsFile {
    return { slots: this.cloneSlots(), active: this.active };
  }

  getPresetsEvent(): PresetsEvent {
    return { type: 'presets', slots: this.cloneSlots(), active: this.active, armed: this.armed };
  }

  // Seed slots from storage. The active slot mirrors the live look — already
  // restored from settings — so trust that over whatever stale copy the store held.
  hydratePresets(file: PresetsFile): void {
    this.slots = normalizeSlots(file.slots);
    this.armed = null;
    this.active = file.active !== null && this.slots[file.active] ? file.active : null;
    if (this.active !== null) this.slots[this.active] = this.captureLook();
  }

  selectPreset(slot: number): void {
    if (slot < 0 || slot >= this.slots.length) return;
    const target = this.slots[slot];
    if (!target) {
      this.slots[slot] = this.captureLook();
      this.active = slot;
      this.armed = null;
      this.emitPresets();
      return;
    }
    if (this.active === slot && this.armed === null) return;
    if (this.lookSig(target) === this.lookSig(this.captureLook())) {
      this.active = slot;
      this.armed = null;
      this.emitPresets();
      return;
    }
    this.armed = slot;
    this.emitPresets();
  }

  clearPreset(slot: number): void {
    if (slot < 0 || slot >= this.slots.length) return;
    if (!this.slots[slot] && this.active !== slot && this.armed !== slot) return;
    this.slots[slot] = null;
    if (this.active === slot) this.active = null;
    if (this.armed === slot) this.armed = null;
    this.emitPresets();
  }

  setPresets(slots: Slots): void {
    this.slots = normalizeSlots(slots);
    this.active = null;
    this.armed = null;
    this.emitPresets();
  }

  private captureLook(): Preset {
    return { effect: this.effectId, params: cloneParams(this.params) };
  }

  private lookSig(p: Preset): string {
    return snapshotSignature({
      effect: p.effect,
      params: p.params,
      speed: 0,
      brightness: 0,
      bpm: 0,
    });
  }

  private cloneSlots(): Slots {
    return this.slots.map((s) => (s ? { effect: s.effect, params: cloneParams(s.params) } : null));
  }

  private emitPresets(): void {
    this.notify(this.getPresetsEvent());
  }

  // Fold the live look into the active slot on every edit; the slot is a mirror,
  // not a saved copy, so there's no save gesture.
  private commitActive(): void {
    if (this.active === null) return;
    this.slots[this.active] = this.captureLook();
  }

  private applyLook(p: Preset): void {
    if (p.effect !== this.effectId) {
      this.effectId = p.effect;
      this.layers = this.layersById[p.effect];
    }
    this.mergeParams(p.params);
  }

  // A select that changed the look waits here for the downbeat, so live switches
  // land on the beat.
  private fireArmed(): void {
    const slot = this.armed;
    if (slot === null) return;
    this.armed = null;
    const p = this.slots[slot];
    if (!p) {
      this.emitPresets();
      return;
    }
    this.applyLook(p);
    this.active = slot;
    this.notify(this.getState());
    this.emitPresets();
  }

  // Resolve the active effect's knobs for this frame, per layer: base + beat-kick,
  // then integrate any rate knobs into their running phase (advanced by dt·speed)
  // and expose that phase in place of the rate. Each layer also carries its ramp.
  private resolveActiveKnobs(dt: number, dBeat: number): Record<string, LayerRuntime> {
    const schema = EFFECT_KNOBS[this.effectId];
    const params = this.params[this.effectId];
    if (!schema || !params) return {};
    const kick = kickCurve(this.beat, this.bpm);
    const phases = this.phases[this.effectId];
    const byLayer: Record<string, LayerRuntime> = {};
    for (const [layer, knobs] of Object.entries(schema)) {
      const state = params[layer];
      const resolved = resolveKnobs(knobs, state.knobs, kick);
      const acc = phases?.[layer];
      if (acc) {
        for (const key in knobs) {
          const t = knobs[key].type;
          if (t === 'rate') {
            acc[key] += resolved[key] * dt * this.speed;
            resolved[key] = acc[key];
          } else if (t === 'beatRatio') {
            acc[key] += resolved[key] * dBeat;
            resolved[key] = acc[key];
          }
        }
      }
      byLayer[layer] = { knobs: resolved, ramp: state.ramp };
    }
    return byLayer;
  }

  renderFrame(dt: number): void {
    const advance = (dt * this.bpm) / 60;
    const ease = this.beatNudge * Math.min(1, advance);
    this.beatNudge -= ease;
    const prevBeat = Math.floor(this.beat);
    const dBeat = advance + ease;
    this.beat += dBeat;
    const beat = Math.floor(this.beat);

    if (beat > prevBeat) {
      this.fireArmed();
      this.notify({ type: 'beat', beat });
    }

    if (!this.running) return;

    this.phase += dt * this.speed;

    const layers = this.layers;
    const knobsByLayer = this.resolveActiveKnobs(dt, dBeat);
    for (let i = 0; i < this.pixels.length; i++) {
      const p = this.pixels[i];
      const buf = this.buffers.get(p.universe)!;
      if (!layers) {
        buf[p.ch0] = p.base[0];
        buf[p.ch0 + 1] = p.base[1];
        buf[p.ch0 + 2] = p.base[2];
        continue;
      }
      paintLayers(
        buf,
        p.ch0,
        layers,
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
        knobsByLayer,
      );
    }

    for (const [universe, buf] of this.buffers) this.emit(universe, buf, this.brightness);
  }
}
