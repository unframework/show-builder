import type { Vec3 } from '../coords';
import { rollLeds, type LedScene } from '../ledScene';
import type { Canopy } from '../pixelData';

// Each run carries its own universe + start channel. A parabolic sag droops Y,
// and a faint line traces the run's catenary.
const SAG = 1.5;

export function buildCanopy(scene: LedScene, data: Canopy): void {
  data.runs.forEach((run, ri) => {
    const n = run.pixel_positions.length;
    const worlds: Vec3[] = run.pixel_positions.map(([catX, catY, catZ], i) => {
      const t = i / (n - 1);
      return [-catZ, catY - SAG * 4 * t * (1 - t), catX];
    });
    scene.points(
      'canopy',
      `canopy:${ri}`,
      rollLeds(worlds, run.universe, run.universe_start_channel),
      {
        circular: true,
        size: 0.3,
      },
    );
    scene.line('canopy', worlds);
  });
}
