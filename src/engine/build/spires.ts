import type { Vec3 } from '../coords';
import type { Spire } from '../pixelData';
import type { SceneBuilder } from '../SceneBuilder';

// Each strand carries its own universe + start channel. Dots are circular sprites.
export function buildSpires(b: SceneBuilder, spires: Spire[]): void {
  const color = b.zoneColor('spires');
  for (const data of spires) {
    for (const strand of data.strands) {
      const positions: Vec3[] = strand.pixel_positions.map(([cx, cy, cz]) => [-cz, cy, cx]);
      b.add(
        'spires',
        b.trackedPoints(
          positions,
          strand.universe,
          strand.universe_start_channel,
          color,
          true,
          0.3,
        ),
      );
    }
  }
}
