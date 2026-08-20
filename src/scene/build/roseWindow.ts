import type { Vec3 } from '../coords';
import type { LedScene } from '../ledScene';
import type { CellPolygons } from '../pixelData';
import { ROSE_CELL_CHANNEL } from '../zones';

// 16 petals × 14 cells = 224 cell meshes. Window plane sits at Three.js Z=WZ;
// shapes live in the XY plane at that Z. Camera looks from behind, so X is
// negated to match the audience-facing view.
const WX = 0.443;
const WY = 5.936;
const WZ = -8.567;

export const ROSE_CENTER_WORLD: Vec3 = [WX, WY, WZ];

function rotatePetal(r: number, t: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [r * Math.sin(a) + t * Math.cos(a), r * Math.cos(a) - t * Math.sin(a)];
}

export function buildRoseWindow(scene: LedScene, cellData: CellPolygons): void {
  for (let k = 0; k < 16; k++) {
    const universe = k < 8 ? 1 : 2;
    const petalInUniv = k % 8;
    const angleDeg = k * 22.5;
    for (const cellDef of cellData.cells) {
      const cellOff = ROSE_CELL_CHANNEL[cellDef.cell];
      if (cellOff === undefined) continue;
      const ch0 = petalInUniv * 42 + cellOff;

      const outline: [number, number][] = cellDef.ring.map(([r, t]) => {
        const [wx, wy] = rotatePetal(r, t, angleDeg);
        return [-wx / 1000, wy / 1000];
      });

      const cR = cellDef.ring.reduce((s, [r]) => s + r, 0) / cellDef.ring.length;
      const cT = cellDef.ring.reduce((s, [, t]) => s + t, 0) / cellDef.ring.length;
      const [crx, cry] = rotatePetal(cR, cT, angleDeg);
      const world: Vec3 = [WX - crx / 1000, WY + cry / 1000, WZ];

      scene.mesh('roseWindow', outline, [WX, WY, WZ], { universe, ch0, world });
    }
  }
}
