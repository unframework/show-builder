import type { Vec3 } from '../coords';
import type { LedScene } from '../ledScene';
import type { Wash } from '../pixelData';

// 22 single-pixel 12 V floods across the four towers. Channel N drives exactly one
// flood — the sim reflects the build, no channel-map cleverness.
export const FLOOD_FIXTURE_RADIUS = 0.14;
export const FLOOD_BEAM_HEIGHT = 1.8;
export const FLOOD_BEAM_RADIUS = 0.55;

export function buildWash(scene: LedScene, data: Wash): void {
  data.pixels.forEach((pixel, i) => {
    const [catX, catY, catZ] = pixel.position;
    const world: Vec3 = [-catZ, catY, catX];
    scene.flood(
      'wash',
      `wash:${i}`,
      { universe: pixel.universe, ch0: pixel.universe_start_channel - 1, world },
      pixel.aim,
    );
  });
}
