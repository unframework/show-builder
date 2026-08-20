import type { Vec3 } from '../coords';
import { rollLeds, type LedScene } from '../ledScene';
import type { Spire } from '../pixelData';

// Each strand carries its own universe + start channel. Dots are circular sprites.
export function buildSpires(scene: LedScene, spires: Spire[]): void {
  for (const data of spires) {
    for (const strand of data.strands) {
      const worlds: Vec3[] = strand.pixel_positions.map(([cx, cy, cz]) => [-cz, cy, cx]);
      scene.points('spires', rollLeds(worlds, strand.universe, strand.universe_start_channel), {
        circular: true,
        size: 0.3,
      });
    }
  }
}
