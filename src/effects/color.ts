const euclideanModulo = (n: number, m: number) => ((n % m) + m) % m;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}

// Mirrors THREE.Color.setHSL: with the default working color space no conversion
// is applied, so these are the raw channel values the Three sim produced.
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = euclideanModulo(h, 1);
  s = clamp01(s);
  l = clamp01(l);
  if (s === 0) return [l, l, l];
  const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const q = 2 * l - p;
  return [hue2rgb(q, p, h + 1 / 3), hue2rgb(q, p, h), hue2rgb(q, p, h - 1 / 3)];
}
