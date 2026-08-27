import type { FrameSink } from './EffectSource';

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));

export type RgbBytesSink = (universe: number, bytes: Uint8Array) => void;

// The output stage: master brightness, then 8-bit quantization — the last lossy
// step before hardware. A power-aware limiter belongs here too, attenuating the
// float RGB after brightness and before quantization.
export function finishFrame(rgb: Float64Array, out: Uint8Array, brightness: number): void {
  for (let i = 0; i < rgb.length; i++) out[i] = clampByte(rgb[i] * brightness);
}

// Adapts a byte sink into the float frame an EffectSource emits, quantizing each
// universe through a reused scratch buffer.
export function toRgbBytes(sink: RgbBytesSink): FrameSink {
  const scratch = new Map<number, Uint8Array>();
  return (universe, rgb, brightness) => {
    let out = scratch.get(universe);
    if (!out || out.length !== rgb.length) {
      out = new Uint8Array(rgb.length);
      scratch.set(universe, out);
    }
    finishFrame(rgb, out, brightness);
    sink(universe, out);
  };
}
