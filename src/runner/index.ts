import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEffectSettings, EffectSource } from '../effects/EffectSource';
import { toRgbBytes } from '../effects/frameOutput';
import { DdpOutput } from '../relay/ddp';
import { SacnOutput } from '../relay/e131';
import type { PixelOutput } from '../relay/pixelOutput';
import { ROSE_CENTER_WORLD } from '../scene/build/roseWindow';
import type { Vec3 } from '../scene/coords';
import type { Led, LedScene } from '../scene/ledScene';
import { computeBounds, normalizePoint, type PixelDescriptor } from '../scene/normalize';
import { assemblePixelMap, type PixelMap } from '../scene/pixelData';
import { runBuilders } from '../scene/runBuilders';
import { ZONE_DEFS, type ZoneId } from '../scene/zones';
import { startControlServer } from './controlServer';
import { loadPetalExpander } from './petalExpand';
import { createSettingsSaver, loadSettings, resolveStateDir } from './settingsStore';
import { createPresetsSaver, loadPresets } from './presetsStore';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PIXEL_MAP_DIR = process.env.PIXEL_MAP_DIR ?? join(REPO_ROOT, 'pixel-map');
const UI_DIR = process.env.RUNNER_UI_DIR ?? join(REPO_ROOT, 'dist');
const OUTPUT_PROTOCOL = process.env.RUNNER_OUTPUT?.toLowerCase() === 'sacn' ? 'sacn' : 'ddp';
const DEFAULT_PORT = OUTPUT_PROTOCOL === 'ddp' ? 4048 : 5568;
const HOST_KEY = OUTPUT_PROTOCOL === 'ddp' ? 'ddpHost' : 'sacnHost';
const PORT_KEY = OUTPUT_PROTOCOL === 'ddp' ? 'ddpPort' : 'sacnPort';
const ENV_OUTPUT_HOST = process.env.RUNNER_OUTPUT_HOST ?? process.env.SACN_HOST;
const ENV_OUTPUT_PORT = process.env.RUNNER_OUTPUT_PORT ?? process.env.SACN_PORT;
const RUNNER_HOST = process.env.RUNNER_HOST ?? '0.0.0.0';
const RUNNER_PORT = Number(process.env.RUNNER_PORT ?? 3002);
const FPS = Number(process.env.RUNNER_FPS ?? 40);

interface RawLed {
  zone: ZoneId;
  segment: string;
  universe: number;
  ch0: number;
  world: Vec3;
}

// LedScene backend with no rendering: just accumulates every LED.
class HeadlessScene implements LedScene {
  readonly leds: RawLed[] = [];

  mesh(zone: ZoneId, segment: string, _outline: [number, number][], _origin: Vec3, led: Led): void {
    this.collect(zone, segment, led);
  }

  cone(zone: ZoneId, segment: string, led: Led): void {
    this.collect(zone, segment, led);
  }

  flood(zone: ZoneId, segment: string, led: Led): void {
    this.collect(zone, segment, led);
  }

  points(zone: ZoneId, segment: string, leds: Led[]): void {
    for (const led of leds) this.collect(zone, segment, led);
  }

  line(): void {}

  private collect(zone: ZoneId, segment: string, led: Led): void {
    this.leds.push({ zone, segment, universe: led.universe, ch0: led.ch0, world: led.world });
  }
}

// Matches THREE.ColorManagement's sRGB→linear conversion so a headless 'zone'
// effect emits the same resting colors the browser sim renders.
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

function hexToLinearRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [
    srgbToLinear(((n >> 16) & 0xff) / 255),
    srgbToLinear(((n >> 8) & 0xff) / 255),
    srgbToLinear((n & 0xff) / 255),
  ];
}

const ZONE_BASE = new Map<ZoneId, [number, number, number]>(
  ZONE_DEFS.map((z) => [z.id, hexToLinearRgb(z.hex)]),
);

// The headless analogue of CathedralEngine.getPixels()/getFocus(): resolves the
// pixel map to normalized LED descriptors and the rose-window focus, no Three.js.
function buildDescriptors(map: PixelMap): { pixels: PixelDescriptor[]; focus: Vec3 } {
  const scene = new HeadlessScene();
  runBuilders(scene, map);

  const bounds = computeBounds(scene.leds.map((l) => l.world));
  const pixels = scene.leds.map((l): PixelDescriptor => {
    const [xn, yn, zn] = normalizePoint(l.world, bounds);
    return {
      universe: l.universe,
      ch0: l.ch0,
      xn,
      yn,
      zn,
      twinkleOffset: Math.random() * Math.PI * 2,
      base: ZONE_BASE.get(l.zone)!,
      zone: l.zone,
      segment: l.segment,
    };
  });

  return { pixels, focus: normalizePoint(ROSE_CENTER_WORLD, bounds) };
}

async function main(): Promise<void> {
  const map = await assemblePixelMap(async (file, schema) => {
    const raw = await readFile(join(PIXEL_MAP_DIR, file), 'utf8');
    return schema.parse(JSON.parse(raw));
  });
  const { pixels, focus } = buildDescriptors(map);

  const stateDir = resolveStateDir();
  const saved = await loadSettings(stateDir);
  const saver = createSettingsSaver(stateDir);
  const savedPresets = await loadPresets(stateDir);
  const presetsSaver = createPresetsSaver(stateDir);

  const startHost = saved[HOST_KEY] ?? ENV_OUTPUT_HOST ?? '127.0.0.1';
  const startPort = saved[PORT_KEY] ?? Number(ENV_OUTPUT_PORT ?? DEFAULT_PORT);
  const output: PixelOutput =
    OUTPUT_PROTOCOL === 'ddp'
      ? new DdpOutput(startHost, startPort)
      : new SacnOutput(startHost, startPort);
  const expander = await loadPetalExpander(PIXEL_MAP_DIR);
  const source = new EffectSource(
    pixels,
    focus,
    toRgbBytes(expander ? expander.wrap(output.emit) : output.emit),
  );
  // Boot stopped regardless of the persisted flag: a human taps start in the UI
  // before the runner drives real hardware.
  applyEffectSettings(source, { ...saved, running: false });
  source.hydratePresets(savedPresets);

  const persist = (): void => {
    const { host, port } = output.destination;
    const { running, speed, brightness, bpm, layers, params } = source.getState();
    saver.save({
      ...saved,
      [HOST_KEY]: host,
      [PORT_KEY]: port,
      running,
      speed,
      brightness,
      bpm,
      layers,
      params,
    });
  };
  const persistPresets = (): void => presetsSaver.save(source.getPresets());
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void Promise.allSettled([saver.flush(), presetsSaver.flush()]).finally(() => process.exit(0));
    });
  }

  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    source.renderFrame((now - last) / 1000);
    last = now;
  }, 1000 / FPS);

  startControlServer({
    host: RUNNER_HOST,
    port: RUNNER_PORT,
    uiDir: UI_DIR,
    source,
    output,
    onPersist: persist,
    onPersistPresets: persistPresets,
  });
  const { host: outHost, port: outPort } = output.destination;
  const rose = expander ? ' + rose petal expansion (u76–u139)' : '';
  const proto = OUTPUT_PROTOCOL.toUpperCase();
  console.log(
    `[runner] ${pixels.length} pixels → ${proto} ${outHost}:${outPort} @ ${FPS}fps${rose}`,
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
