import { CHANNELS_PER_UNIVERSE, type Vec3 } from '../coords';
import { archPositions, rollLeds, type Led, type LedScene } from '../ledScene';
import type { MainArches, MiniArches, QuadArches } from '../pixelData';

// Full-resolution main arches (~216–233 px/arch). Each arch is >170 px, so its
// stream rolls into the next universe every 170 pixels (510 channels).
export function buildMainArches(scene: LedScene, data: MainArches): void {
  data.arches.forEach((arch, ai) => {
    const chOffset = (arch.universe_start_channel ?? 1) - 1;
    arch.pixel_polygons.forEach((poly, i) => {
      if (!poly) return;
      const outline: [number, number][] = poly.map(([z, y]) => [-z, y]);
      const cx = poly.reduce((s, [z]) => s + z, 0) / 4;
      const cy = poly.reduce((s, [, y]) => s + y, 0) / 4;
      const absCh = chOffset + i * 3;
      const led: Led = {
        universe: arch.universe + Math.floor(absCh / CHANNELS_PER_UNIVERSE),
        ch0: absCh % CHANNELS_PER_UNIVERSE,
        world: [-cx, cy, arch.x_position_m] as Vec3,
      };
      scene.mesh('mainArches', `main:${ai}`, outline, [0, 0, arch.x_position_m], led);
    });
  });
}

// Mini arches start at channel 1 (no universe_start_channel in the data).
export function buildMiniArches(scene: LedScene, left: MiniArches, right: MiniArches): void {
  [...left.arches, ...right.arches].forEach((arch, ai) => {
    const worlds = archPositions(arch.pixel_positions, 'z', arch.x_position_m);
    scene.points('miniArches', `mini:${ai}`, rollLeds(worlds, arch.universe, 1), {
      circular: false,
      size: 0.25,
    });
  });
}

// Quad arches: faces may share a universe, so each carries its own start channel.
export function buildQuadArches(scene: LedScene, quads: QuadArches[]): void {
  quads.forEach((quad, qi) => {
    quad.faces.forEach((face, fi) => {
      const worlds = archPositions(face.pixel_positions, face.span_axis, face.fixed_axis_pos_m);
      scene.points(
        'quadArches',
        `quad:${qi}:${fi}`,
        rollLeds(worlds, face.universe, face.universe_start_channel),
        { circular: false, size: 0.25 },
      );
    });
  });
}
