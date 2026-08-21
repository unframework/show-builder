import type { Vec3 } from '../coords';
import { rollLeds, type LedScene } from '../ledScene';
import type { Spire } from '../pixelData';

// Each strand carries its own universe + start channel. Dots are circular sprites.
export function buildSpires(scene: LedScene, spires: Spire[]): void {
  spires.forEach((data, di) => {
    data.strands.forEach((strand, si) => {
      const worlds: Vec3[] = strand.pixel_positions.map(([cx, cy, cz]) => [-cz, cy, cx]);
      scene.points(
        'spires',
        `spire:${di}:${si}`,
        rollLeds(worlds, strand.universe, strand.universe_start_channel),
        { circular: true, size: 0.3 },
      );
    });
  });
}
