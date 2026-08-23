import { CHANNELS_PER_UNIVERSE, type Vec3 } from './coords';
import type { ZoneId } from './zones';

// One addressable LED once its world position and DMX address are resolved, but
// before any rendering or normalization. The geometry builders speak only this.
export interface Led {
  universe: number;
  ch0: number;
  world: Vec3;
}

export interface PointStyle {
  circular: boolean;
  size: number;
}

// A single-pixel flood: the fixture body plus a translucent beam glyph aimed up
// or down from it. The beam is display-only and shares the fixture's channel.
export type Aim = 'up' | 'down';

// Sink the zone builders emit into: a Three.js scene in the browser, a plain
// collector in the headless runner. Render arguments (outlines, styles) are
// ignored by backends that only need the LED addresses.
export interface LedScene {
  mesh(zone: ZoneId, segment: string, outline: [number, number][], origin: Vec3, led: Led): void;
  cone(zone: ZoneId, segment: string, led: Led): void;
  flood(zone: ZoneId, segment: string, led: Led, aim: Aim): void;
  points(zone: ZoneId, segment: string, leds: Led[], style: PointStyle): void;
  line(zone: ZoneId, path: Vec3[]): void;
}

// Pixel i occupies channels [startCh1-1 + 3i ..], rolling into universe+1 every
// 170 pixels (510 channels), matching xLights / F48V5 packing.
export function rollLeds(worlds: Vec3[], universe: number, startCh1: number): Led[] {
  const ch0base = startCh1 - 1;
  return worlds.map((world, i) => {
    const absOff = ch0base + i * 3;
    return {
      universe: universe + Math.floor(absOff / CHANNELS_PER_UNIVERSE),
      ch0: absOff % CHANNELS_PER_UNIVERSE,
      world,
    };
  });
}

// Arch pixel positions are [spanCoord, catY]; span/fixed map to Three.js X/Z.
export function archPositions(
  pixelPositions: [number, number][],
  spanAxis: 'x' | 'z',
  fixedValue: number,
): Vec3[] {
  return pixelPositions.map(([a, b]) =>
    spanAxis === 'z' ? [-a, b, fixedValue] : [-fixedValue, b, a],
  );
}
