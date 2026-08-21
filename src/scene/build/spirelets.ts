import type { Vec3 } from '../coords';
import type { LedScene } from '../ledScene';
import type { Spirelets } from '../pixelData';

// 20 corner cones. Base Y is set explicitly from spire/arch geometry because the
// OBJ positions sit slightly above the true base.
export const SPIRELET_HEIGHT = 2.0;
export const SPIRELET_RADIUS = 0.18;
const FRONT_SPIRE_BASE_Y = 12.25;
const BACK_SPIRE_BASE_Y = 8.342;
const FRONT_TOWER_BASE_Y = 8.018;

export function buildSpirelets(scene: LedScene, data: Spirelets): void {
  data.pixels.forEach((pixel, i) => {
    const [catX, catY, catZ] = pixel.position;
    const baseY = pixel.corner.startsWith('back')
      ? BACK_SPIRE_BASE_Y
      : catY > 10
        ? FRONT_SPIRE_BASE_Y
        : FRONT_TOWER_BASE_Y;
    const world: Vec3 = [-catZ, baseY + SPIRELET_HEIGHT / 2, catX];
    scene.cone('spirelets', `spirelet:${i}`, {
      universe: pixel.universe,
      ch0: pixel.universe_start_channel - 1,
      world,
    });
  });
}
