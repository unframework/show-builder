import { useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';
import { ZONE_DEFS, type ZoneId } from '../engine/zones';

export function ZoneToggles({ engine }: { engine: CathedralEngine }) {
  const [visible, setVisible] = useState<Record<ZoneId, boolean>>(
    () => Object.fromEntries(ZONE_DEFS.map((z) => [z.id, true])) as Record<ZoneId, boolean>,
  );

  const toggle = (id: ZoneId) => {
    const next = !visible[id];
    setVisible((v) => ({ ...v, [id]: next }));
    engine.setZoneVisible(id, next);
  };

  return (
    <div className="toggles">
      {ZONE_DEFS.map((z) => (
        <label key={z.id} className="zrow">
          <input type="checkbox" checked={visible[z.id]} onChange={() => toggle(z.id)} />
          <span className="zdot" style={{ background: z.hex }} />
          <span className="zlabel">{z.label}</span>
        </label>
      ))}
    </div>
  );
}
