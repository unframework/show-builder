import type { Vec3 } from '../scene/coords';
import type { PixelDescriptor } from '../scene/normalize';
import {
  effectResumeState,
  type ControlState,
  type EffectEvent,
  type EffectResumeState,
  type EffectSettings,
  type LayerDef,
  type LayerParams,
  type Preset,
  type PresetsEvent,
  type Slots,
} from './controlMessages';
import { snapshotSignature } from '../controlHistory';
import { emptySlots, normalizeSlots, type PresetsFile } from './presets';
import {
  createDemoEffectContext,
  createEffectRuntime,
  DEFAULT_LOOKS,
  LAYER_KINDS,
  type DemoEffectContext,
  type EffectRuntime,
} from './demoEffects';
import {
  buildDefs,
  defSchemas,
  paintLayers,
  withDefaults,
  type Layer,
  type LayerRuntime,
} from './layers';
import { defaultKnobValues, kickCurve, resolveKnobs, type KnobSchema } from './knobs';
import type { Ramp } from './stages';

export type FrameSink = (universe: number, rgb: Float64Array, brightness: number) => void;
type Listener = (event: EffectEvent) => void;

// Seed a live source from persisted settings; the stack lands before its params so
// they attach to seeded layers, and running is applied last so its early-return
// can't be shadowed by an intermediate state.
export function applyEffectSettings(source: EffectSource, settings: EffectSettings): void {
  if (settings.layers) source.setLayers(settings.layers);
  if (settings.speed !== undefined) source.setSpeed(settings.speed);
  if (settings.brightness !== undefined) source.setBrightness(settings.brightness);
  if (settings.bpm !== undefined) source.setBpm(settings.bpm);
  if (settings.params) source.setParams(settings.params);
  if (settings.running !== undefined) source.setRunning(settings.running);
}

// Fresh copies so each emitted state has a new identity (React re-renders on it)
// and consumers can't mutate the engine's live values.
const cloneParams = (params: LayerParams): LayerParams => structuredClone(params);
const cloneTopology = (defs: LayerDef[]): LayerDef[] => structuredClone(defs);

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

// Procedural frame source: the effect analogue of the relay. Iterates every pixel,
// composites the live layer stack at the current phase, and emits a per-universe
// float RGB buffer plus the master brightness. Brightness and 8-bit quantization
// happen downstream. Environment-agnostic: a driver advances it via `renderFrame`.
export class EffectSource {
  private readonly pixels: PixelDescriptor[];
  private readonly emit: FrameSink;
  private readonly buffers = new Map<number, Float64Array>();
  private readonly listeners = new Set<Listener>();
  private readonly context: DemoEffectContext;
  private readonly ctx: EffectRuntime;
  private readonly kinds = LAYER_KINDS;

  private liveLayers: LayerDef[] = [];
  private builtLayers: Layer[] = [];
  private activeSchema: Record<string, KnobSchema> = {};
  private readonly liveParams: LayerParams = {};
  private readonly livePhases: Record<string, Record<string, number>> = {};

  private running = true;
  private speed = 1;
  private brightness = 1;
  private phase = 0;
  private bpm = 120;
  private beat = 0;
  private beatNudge = 0;

  private slots: Slots = emptySlots();
  private active: number | null = null;
  private armed: number | null = null;

  constructor(pixels: PixelDescriptor[], focus: Vec3, emit: FrameSink, resume?: ResumeState) {
    this.pixels = pixels;
    this.emit = emit;
    this.context = resume?.context ?? createDemoEffectContext();
    this.ctx = createEffectRuntime(this.context, pixels, focus);

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
      running: this.running,
      speed: this.speed,
      brightness: this.brightness,
      bpm: this.bpm,
      layers: cloneTopology(this.liveLayers),
      params: cloneParams(this.liveParams),
    };
  }

  getResumeState(): ResumeState {
    return {
      snapshot: {
        running: this.running,
        speed: this.speed,
        brightness: this.brightness,
        bpm: this.bpm,
        phase: this.phase,
        beat: this.beat + this.beatNudge,
        layers: cloneTopology(this.liveLayers),
        params: this.liveParams,
        phases: this.livePhases,
      },
      context: this.context,
    };
  }

  private restore(snapshot: unknown): void {
    const parsed = effectResumeState.safeParse(snapshot);
    if (!parsed.success) return;
    const state = parsed.data;

    this.running = state.running;
    this.speed = state.speed;
    this.brightness = state.brightness;
    this.bpm = state.bpm;
    this.phase = state.phase;
    this.beat = state.beat;
    this.beatNudge = 0;
    this.applyTopology(state.layers);
    if (state.params) this.mergeParams(state.params);
    if (state.phases) {
      for (const [layer, acc] of Object.entries(state.phases)) {
        const layerAcc = this.livePhases[layer];
        if (!layerAcc) continue;
        for (const [key, val] of Object.entries(acc)) if (key in layerAcc) layerAcc[key] = val;
      }
    }
  }

  private mergeParams(incoming: LayerParams): void {
    for (const [layer, st] of Object.entries(incoming)) {
      const tl = this.liveParams[layer];
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

  private notify(event: EffectEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  // Seed a layer's runtime knobs, ramp, and phase accumulators from its kind
  // schema. `force` reseeds even if the name already has state (new layer / kind
  // swap); otherwise existing knob values survive a reorder or blend change.
  private seedLayer(def: LayerDef, force = false): void {
    const kind = this.kinds[def.kind as keyof typeof this.kinds];
    if (!kind) return;
    const schema = withDefaults(kind.schema, def.defaults);
    const ramp = def.ramp ?? kind.defaultRamp;
    if (force || !this.liveParams[def.name]) {
      this.liveParams[def.name] = ramp
        ? { knobs: defaultKnobValues(schema), ramp }
        : { knobs: defaultKnobValues(schema) };
    }
    const acc: Record<string, number> = {};
    for (const key in schema) {
      const t = schema[key].type;
      if (t === 'rate' || t === 'beatRatio') acc[key] = 0;
    }
    if (Object.keys(acc).length) {
      if (force || !this.livePhases[def.name]) this.livePhases[def.name] = acc;
    } else {
      delete this.livePhases[def.name];
    }
  }

  private rebuildLayers(): void {
    this.builtLayers = buildDefs(this.liveLayers, this.kinds, this.ctx);
    this.activeSchema = defSchemas(this.liveLayers, this.kinds);
  }

  // Replace the live stack: drop unknown kinds, seed new/kind-swapped layers, and
  // discard params for layers no longer present.
  private applyTopology(defs: LayerDef[]): void {
    const clean = defs.filter((d) => d.kind in this.kinds);
    const prev = new Map(this.liveLayers.map((d) => [d.name, d]));
    this.liveLayers = clean;
    const names = new Set(clean.map((d) => d.name));
    for (const def of clean) this.seedLayer(def, prev.get(def.name)?.kind !== def.kind);
    for (const name of Object.keys(this.liveParams))
      if (!names.has(name)) delete this.liveParams[name];
    for (const name of Object.keys(this.livePhases))
      if (!names.has(name)) delete this.livePhases[name];
    this.rebuildLayers();
  }

  setLayers(layers: LayerDef[]): void {
    this.applyTopology(layers);
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

  setParams(params: LayerParams): void {
    this.mergeParams(params);
    this.notify(this.getState());
    this.commitActive();
  }

  setParam(
    layer: string,
    key: string,
    field: 'base' | 'kick' | 'num' | 'den',
    value: number,
  ): void {
    const knob = this.liveParams[layer]?.knobs[key] as Record<string, number> | undefined;
    if (!knob || knob[field] === value) return;

    knob[field] = value;
    this.notify(this.getState());
    this.commitActive();
  }

  setRamp(layer: string, ramp: Ramp): void {
    const state = this.liveParams[layer];
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

  // Seed slots from storage. On a cold start (no live look, no stored slots) seed
  // the built-in looks and boot on the first. Otherwise adopt a slot if no live
  // look was restored from settings, or mirror the restored look into the active
  // slot when one was.
  hydratePresets(file: PresetsFile): void {
    this.slots = normalizeSlots(file.slots);
    this.armed = null;
    this.active = file.active !== null && this.slots[file.active] ? file.active : null;

    if (this.liveLayers.length === 0) {
      if (this.active === null && !this.slots.some(Boolean)) {
        this.slots = this.defaultLookSlots();
        this.active = 0;
      } else if (this.active === null) {
        const first = this.slots.findIndex(Boolean);
        this.active = first < 0 ? null : first;
      }
      const look = this.active !== null ? this.slots[this.active] : null;
      if (look) this.applyLook(look);
      this.notify(this.getState());
    } else if (this.active !== null) {
      this.slots[this.active] = this.captureLook();
    }
    this.emitPresets();
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
    return { layers: cloneTopology(this.liveLayers), params: cloneParams(this.liveParams) };
  }

  private lookSig(p: Preset): string {
    return snapshotSignature({
      layers: p.layers,
      params: p.params,
      speed: 0,
      brightness: 0,
      bpm: 0,
    });
  }

  private cloneSlots(): Slots {
    return this.slots.map((s) =>
      s ? { layers: cloneTopology(s.layers), params: cloneParams(s.params) } : null,
    );
  }

  // A look built from its stack's schema defaults, for seeding empty slots.
  private lookFromDefaults(layers: LayerDef[]): Preset {
    const params: LayerParams = {};
    for (const def of layers) {
      const kind = this.kinds[def.kind as keyof typeof this.kinds];
      if (!kind) continue;
      const schema = withDefaults(kind.schema, def.defaults);
      const ramp = def.ramp ?? kind.defaultRamp;
      params[def.name] = ramp
        ? { knobs: defaultKnobValues(schema), ramp }
        : { knobs: defaultKnobValues(schema) };
    }
    return { layers: cloneTopology(layers), params };
  }

  private defaultLookSlots(): Slots {
    const slots = emptySlots();
    DEFAULT_LOOKS.forEach((look, i) => {
      if (i < slots.length) slots[i] = this.lookFromDefaults(look.layers);
    });
    return slots;
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
    this.applyTopology(p.layers);
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

  // Resolve the live stack's knobs for this frame, per layer: base + beat-kick,
  // then integrate any rate knobs into their running phase (advanced by dt·speed)
  // and expose that phase in place of the rate. Each layer also carries its ramp.
  private resolveActiveKnobs(dt: number, dBeat: number): Record<string, LayerRuntime> {
    const kick = kickCurve(this.beat, this.bpm);
    const byLayer: Record<string, LayerRuntime> = {};
    for (const [layer, knobs] of Object.entries(this.activeSchema)) {
      const state = this.liveParams[layer];
      if (!state) continue;
      const resolved = resolveKnobs(knobs, state.knobs, kick);
      const acc = this.livePhases[layer];
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

    const layers = this.builtLayers;
    const knobsByLayer = this.resolveActiveKnobs(dt, dBeat);
    for (let i = 0; i < this.pixels.length; i++) {
      const p = this.pixels[i];
      const buf = this.buffers.get(p.universe)!;
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
