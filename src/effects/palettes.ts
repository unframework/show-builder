import type { Ramp } from './stages';

export interface NamedRamp {
  id: string;
  name: string;
  ramp: Ramp;
}

const EPSILON = 1e-3;

export const rampsEqual = (a?: Ramp, b?: Ramp): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return (
      Math.abs(p.h - q.h) < EPSILON &&
      Math.abs(p.s - q.s) < EPSILON &&
      Math.abs(p.l - q.l) < EPSILON
    );
  });
};

// Curated two-stop HSL palettes. The first block mirrors the ramps effects ship
// with, so every built-in look stays reachable from the picker.
export const PALETTES: NamedRamp[] = [
  {
    id: 'ember',
    name: 'Ember',
    ramp: [
      { h: -0.2, s: 1, l: 0 },
      { h: 0.05, s: 1, l: 0.5 },
    ],
  },
  {
    id: 'twilight',
    name: 'Twilight',
    ramp: [
      { h: 0.8, s: 0.7, l: 0.14 },
      { h: 0.9, s: 0.55, l: 0.26 },
    ],
  },
  {
    id: 'ice',
    name: 'Ice',
    ramp: [
      { h: 0.66, s: 0.5, l: 0.5 },
      { h: 0.62, s: 0.1, l: 1 },
    ],
  },
  {
    id: 'frost',
    name: 'Frost',
    ramp: [
      { h: 0, s: 0, l: 1 },
      { h: 0.62, s: 0.6, l: 0.5 },
    ],
  },
  {
    id: 'ascension',
    name: 'Ascension',
    ramp: [
      { h: 0, s: 0, l: 1 },
      { h: 0.62, s: 0.5, l: 0.85 },
    ],
  },
  {
    id: 'blush',
    name: 'Blush',
    ramp: [
      { h: 0.9, s: 0.5, l: 0.85 },
      { h: 0, s: 0, l: 1 },
    ],
  },
  {
    id: 'flash',
    name: 'Flash',
    ramp: [
      { h: 0, s: 0, l: 1 },
      { h: 0.03, s: 0.9, l: 0.5 },
    ],
  },
  {
    id: 'mono',
    name: 'Mono',
    ramp: [
      { h: 0, s: 0, l: 0 },
      { h: 0, s: 0, l: 1 },
    ],
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    ramp: [
      { h: 0.78, s: 0.8, l: 0.12 },
      { h: 0.72, s: 0.6, l: 0.55 },
    ],
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    ramp: [
      { h: 0.08, s: 0.9, l: 0.1 },
      { h: 0.13, s: 0.8, l: 0.55 },
    ],
  },
  {
    id: 'verdant',
    name: 'Verdant',
    ramp: [
      { h: 0.33, s: 0.9, l: 0.08 },
      { h: 0.28, s: 0.7, l: 0.5 },
    ],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    ramp: [
      { h: 0.55, s: 0.9, l: 0.1 },
      { h: 0.5, s: 0.7, l: 0.55 },
    ],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    ramp: [
      { h: -0.03, s: 0.95, l: 0.12 },
      { h: 0.11, s: 1, l: 0.55 },
    ],
  },
  {
    id: 'molten',
    name: 'Molten',
    ramp: [
      { h: 0, s: 1, l: 0.08 },
      { h: 0.14, s: 1, l: 0.6 },
    ],
  },
  {
    id: 'meadow',
    name: 'Meadow',
    ramp: [
      { h: 0.19, s: 0.85, l: 0.12 },
      { h: 0.33, s: 0.8, l: 0.55 },
    ],
  },
  {
    id: 'aurora',
    name: 'Aurora',
    ramp: [
      { h: 0.42, s: 0.9, l: 0.12 },
      { h: 0.52, s: 0.8, l: 0.6 },
    ],
  },
  {
    id: 'nebula',
    name: 'Nebula',
    ramp: [
      { h: 0.62, s: 0.9, l: 0.12 },
      { h: 0.85, s: 0.8, l: 0.55 },
    ],
  },
  {
    id: 'orchid',
    name: 'Orchid',
    ramp: [
      { h: 0.78, s: 0.7, l: 0.2 },
      { h: 0.92, s: 0.75, l: 0.6 },
    ],
  },
  {
    id: 'dusk',
    name: 'Dusk',
    ramp: [
      { h: 0.72, s: 0.7, l: 0.15 },
      { h: 1.05, s: 0.9, l: 0.55 },
    ],
  },
  {
    id: 'citrus',
    name: 'Citrus',
    ramp: [
      { h: 0.15, s: 0.95, l: 0.55 },
      { h: 0.02, s: 0.95, l: 0.55 },
    ],
  },
  {
    id: 'tropic',
    name: 'Tropic',
    ramp: [
      { h: 0.35, s: 0.8, l: 0.52 },
      { h: 0.5, s: 0.8, l: 0.52 },
    ],
  },
  {
    id: 'prism',
    name: 'Prism',
    ramp: [
      { h: 0.5, s: 0.8, l: 0.55 },
      { h: 0.85, s: 0.8, l: 0.55 },
    ],
  },
  {
    id: 'fuchsia',
    name: 'Fuchsia',
    ramp: [
      { h: 0.92, s: 0.75, l: 0.58 },
      { h: 0.75, s: 0.75, l: 0.58 },
    ],
  },
];
