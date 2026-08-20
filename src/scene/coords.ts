// Cathedral space: X=front-back (neg=front entrance), Y=height, Z=left-right.
// Three.js space: X=catZ (negated), Y=catY, Z=catX.
export type Vec3 = [number, number, number];

// A pixel's DMX stream rolls into the next universe every 170 pixels (510 channels),
// matching xLights / F48V5 packing.
export const CHANNELS_PER_UNIVERSE = 510;
export const PIXELS_PER_UNIVERSE = 170;
