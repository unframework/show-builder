import { useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';
import { ZONE_DEFS, type ZoneId } from '../scene/zones';

export type SimControlsState = ReturnType<typeof useSimControls>;

export function useSimControls(engine: CathedralEngine) {
  const [zones, setZones] = useState<Record<ZoneId, boolean>>(
    () => Object.fromEntries(ZONE_DEFS.map((z) => [z.id, true])) as Record<ZoneId, boolean>,
  );
  const [figures, setFigures] = useState(true);

  const toggleZone = (id: ZoneId) => {
    const next = !zones[id];
    setZones((v) => ({ ...v, [id]: next }));
    engine.setZoneVisible(id, next);
  };

  const toggleFigures = () => {
    const next = !figures;
    setFigures(next);
    engine.setFiguresVisible(next);
  };

  return { zones, toggleZone, figures, toggleFigures };
}
