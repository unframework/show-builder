import { useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';
import { ZONE_DEFS, type ZoneId } from '../scene/zones';

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
    <div className="flex flex-wrap items-center gap-3">
      {ZONE_DEFS.map((z) => (
        <label key={z.id} className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={visible[z.id]}
            onChange={() => toggle(z.id)}
          />
          <span className="inline-block size-2.5 rounded-full" style={{ background: z.hex }} />
          <span className="text-xs opacity-80">{z.label}</span>
        </label>
      ))}
    </div>
  );
}
