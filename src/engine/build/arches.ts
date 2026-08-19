import * as THREE from 'three';
import { PIXELS_PER_UNIVERSE } from '../coords';
import type { MainArches, MiniArches, QuadArches } from '../pixelData';
import type { SceneBuilder } from '../SceneBuilder';

// Full-resolution main arches (~216–233 px/arch). Each arch is >170 px, so its
// stream rolls into the next universe every 170 pixels (510 channels).
export function buildMainArches(b: SceneBuilder, data: MainArches): void {
  const color = b.zoneColor('mainArches');
  for (const arch of data.arches) {
    const chOffset = (arch.universe_start_channel ?? 1) - 1;
    arch.pixel_polygons.forEach((poly, i) => {
      if (!poly) return;
      const shape = new THREE.Shape();
      poly.forEach(([z, y], k) => (k === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y)));

      const mat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      mesh.position.set(0, 0, arch.x_position_m);
      b.add('mainArches', mesh);

      const cx = poly.reduce((s, [z]) => s + z, 0) / 4;
      const cy = poly.reduce((s, [, y]) => s + y, 0) / 4;
      const absCh = chOffset + i * 3;
      b.meshTarget(
        mat,
        arch.universe + Math.floor(absCh / (PIXELS_PER_UNIVERSE * 3)),
        absCh % (PIXELS_PER_UNIVERSE * 3),
        color,
        [-cx, cy, arch.x_position_m],
      );
    });
  }
}

// Mini arches start at channel 1 (no universe_start_channel in the data).
export function buildMiniArches(b: SceneBuilder, left: MiniArches, right: MiniArches): void {
  const color = b.zoneColor('miniArches');
  for (const arch of [...left.arches, ...right.arches]) {
    b.add(
      'miniArches',
      b.archPoints(arch.pixel_positions, 'z', arch.x_position_m, arch.universe, 1, color),
    );
  }
}

// Quad arches: faces may share a universe, so each carries its own start channel.
export function buildQuadArches(b: SceneBuilder, quads: QuadArches[]): void {
  const color = b.zoneColor('quadArches');
  for (const quad of quads) {
    for (const face of quad.faces) {
      b.add(
        'quadArches',
        b.archPoints(
          face.pixel_positions,
          face.span_axis,
          face.fixed_axis_pos_m,
          face.universe,
          face.universe_start_channel,
          color,
        ),
      );
    }
  }
}
