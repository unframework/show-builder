import * as THREE from 'three';
import type { Vec3 } from '../coords';
import type { Canopy } from '../pixelData';
import type { SceneBuilder } from '../SceneBuilder';

// Each run carries its own universe + start channel. A parabolic sag droops Y,
// and a faint line traces the run's catenary.
const SAG = 1.5;

export function buildCanopy(b: SceneBuilder, data: Canopy): void {
  const color = b.zoneColor('canopy');
  for (const run of data.runs) {
    const n = run.pixel_positions.length;
    const positions: Vec3[] = run.pixel_positions.map(([catX, catY, catZ], i) => {
      const t = i / (n - 1);
      return [-catZ, catY - SAG * 4 * t * (1 - t), catX];
    });
    b.add(
      'canopy',
      b.trackedPoints(positions, run.universe, run.universe_start_channel, color, true, 0.3),
    );

    const linePts = positions.map(([wx, wy, wz]) => new THREE.Vector3(wx, wy, wz));
    b.add(
      'canopy',
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      ),
    );
  }
}
