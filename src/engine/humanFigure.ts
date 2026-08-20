import * as THREE from 'three';

// Simplified standing-person outline, half-width x from centerline and height y in
// meters, walked head-first down the right side then mirrored up the left. Centered
// on x=0 with feet at y=0 so a figure billboards around its own Y axis while staying
// grounded and upright.
const HALF_OUTLINE: [number, number][] = [
  [0.0, 1.75],
  [0.08, 1.72],
  [0.11, 1.66],
  [0.1, 1.6],
  [0.16, 1.54],
  [0.24, 1.42],
  [0.25, 1.2],
  [0.22, 1.0],
  [0.23, 0.78],
  [0.2, 0.62],
  [0.21, 0.42],
  [0.18, 0.12],
  [0.19, 0.0],
  [0.04, 0.0],
  [0.05, 0.4],
  [0.0, 0.55],
];

function silhouetteGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const [x0, y0] = HALF_OUTLINE[0];
  shape.moveTo(x0 + y0 * 0.05, y0);
  for (const [x, y] of HALF_OUTLINE.slice(1)) shape.lineTo(x + y * 0.05, y);
  for (let i = HALF_OUTLINE.length - 1; i >= 0; i--) {
    const [x, y] = HALF_OUTLINE[i];
    shape.lineTo(-x + y * 0.05, y);
  }
  return new THREE.ShapeGeometry(shape);
}

const FIGURE_SPOTS: THREE.Vector3[] = [
  new THREE.Vector3(-0.5, 0.2, -13.3),
  new THREE.Vector3(-0.2, 0.2, -13.8),
  new THREE.Vector3(2.5, 0.2, -11.6),
];

export function createHumanFigures(): THREE.Group {
  const geometry = silhouetteGeometry();
  const material = new THREE.MeshBasicMaterial({
    color: 0x302010,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  for (const spot of FIGURE_SPOTS) {
    const figure = new THREE.Mesh(geometry, material);
    figure.position.copy(spot);
    figure.scale.setScalar(1 - Math.random() * 0.2);
    group.add(figure);
  }
  return group;
}
