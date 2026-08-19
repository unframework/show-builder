import * as THREE from 'three';
import { cathedralToWorld } from '../coords';
import type { Spirelets } from '../pixelData';
import type { SceneBuilder } from '../SceneBuilder';

// 20 corner cones. Base Y is set explicitly from spire/arch geometry because the
// OBJ positions sit slightly above the true base.
const HEIGHT = 2.0;
const RADIUS = 0.18;
const FRONT_SPIRE_BASE_Y = 12.25;
const BACK_SPIRE_BASE_Y = 8.342;
const FRONT_TOWER_BASE_Y = 8.018;

export function buildSpirelets(b: SceneBuilder, data: Spirelets): void {
  const color = b.zoneColor('spirelets');
  const geo = new THREE.ConeGeometry(RADIUS, HEIGHT, 3, 1);

  for (const pixel of data.pixels) {
    const [catX, catY, catZ] = pixel.position;
    const baseY = pixel.corner.startsWith('back')
      ? BACK_SPIRE_BASE_Y
      : catY > 10
        ? FRONT_SPIRE_BASE_Y
        : FRONT_TOWER_BASE_Y;

    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.copy(cathedralToWorld(catX, baseY + HEIGHT / 2, catZ));
    b.add('spirelets', cone);
    b.meshTarget(mat, pixel.universe, pixel.universe_start_channel - 1, color, [
      -catZ,
      baseY + HEIGHT / 2,
      catX,
    ]);
  }
}
