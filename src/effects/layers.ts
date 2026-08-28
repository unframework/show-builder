import { hslToRgb } from './color';
import type { EffectInput } from './demoEffects';
import type { ResolvedKnobs } from './knobs';
import type { Ramp } from './stages';

export type Hsla = [number, number, number, number];

export type BlendMode = 'over' | 'add' | 'screen' | 'multiply';

// A short name scopes the layer's knobs in the stack, so `paint` reads generic
// keys. Authored in HSL (+ coverage), but composited in RGB: hue is the wrong
// space to mix dissimilar colors, and add/screen/multiply only mean anything on
// light. `ramp` is the palette the layer colours through, surfaced for the UI (a
// layer whose colour isn't ramp-driven leaves it undefined).
export interface Layer {
  name: string;
  blend: BlendMode;
  ramp?: Ramp;
  paint: (input: EffectInput, knobs: ResolvedKnobs) => Hsla;
}

const NO_KNOBS: ResolvedKnobs = {};

// Composite the stack bottom→top into `out` at `ch0`, in linear RGB. The floor is
// black, so the bottom layer resolves to its own color under any blend mode.
// Results stay unclamped floats — the output stage caps them, leaving additive
// headroom for a downstream limiter.
export function paintLayers(
  out: Float64Array,
  ch0: number,
  layers: Layer[],
  input: EffectInput,
  knobsByLayer: Record<string, ResolvedKnobs>,
): void {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const layer of layers) {
    const [h, s, l, a] = layer.paint(input, knobsByLayer[layer.name] ?? NO_KNOBS);
    if (a <= 0) continue;
    const [tr, tg, tb] = hslToRgb(h, s, l);
    switch (layer.blend) {
      case 'over':
        r = r * (1 - a) + tr * a;
        g = g * (1 - a) + tg * a;
        b = b * (1 - a) + tb * a;
        break;
      case 'add':
        r += tr * a;
        g += tg * a;
        b += tb * a;
        break;
      case 'screen':
        r += tr * a * (1 - r);
        g += tg * a * (1 - g);
        b += tb * a * (1 - b);
        break;
      case 'multiply':
        r *= 1 + a * (tr - 1);
        g *= 1 + a * (tg - 1);
        b *= 1 + a * (tb - 1);
        break;
    }
  }
  out[ch0] = r;
  out[ch0 + 1] = g;
  out[ch0 + 2] = b;
}
