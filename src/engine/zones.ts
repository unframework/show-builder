export const ZONE_DEFS = [
  { id: 'roseWindow', label: 'Rose Window', hex: '#ff8855' },
  { id: 'mainArches', label: 'Main Arches', hex: '#4488ff' },
  { id: 'miniArches', label: 'Mini Arches', hex: '#66aaff' },
  { id: 'quadArches', label: 'Quad Arches', hex: '#33ddff' },
  { id: 'spires', label: 'Spires', hex: '#ffee44' },
  { id: 'spirelets', label: 'Spirelets', hex: '#ffbb22' },
  { id: 'canopy', label: 'Canopy', hex: '#77ff99' },
] as const;

export type ZoneId = (typeof ZONE_DEFS)[number]['id'];

// Rose window: universe = petal + 1 (1–16), 14 RGB cells × 42 channels per petal.
// Maps a WLED cell name to its 0-based channel offset within a petal.
export const ROSE_CELL_CHANNEL: Record<string, number> = {
  '1b': 0,
  '2a': 3,
  '2c': 6,
  '3b': 9,
  '4a': 12,
  '4c': 15,
  '5a': 18,
  '5b': 21,
  '5c': 24,
  '6a': 27,
  '6c': 30,
  '7a': 33,
  '7b': 36,
  '7c': 39,
};
