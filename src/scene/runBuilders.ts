import { buildMainArches, buildMiniArches, buildQuadArches } from './build/arches';
import { buildCanopy } from './build/canopy';
import { buildRoseWindow } from './build/roseWindow';
import { buildSpirelets } from './build/spirelets';
import { buildSpires } from './build/spires';
import type { LedScene } from './ledScene';
import type { PixelMap } from './pixelData';

export function runBuilders(scene: LedScene, map: PixelMap): void {
  buildRoseWindow(scene, map.cellPolygons);
  buildMainArches(scene, map.mainArches);
  buildMiniArches(scene, map.miniLeft, map.miniRight);
  buildQuadArches(scene, map.quads);
  buildSpires(scene, map.spires);
  buildSpirelets(scene, map.spirelets);
  buildCanopy(scene, map.canopy);
}
