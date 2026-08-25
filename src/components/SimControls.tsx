import { ZONE_DEFS } from '../scene/zones';
import type { SimControlsState } from './useSimControls';

export function SimControls({ controls }: { controls: SimControlsState }) {
  const { zones, toggleZone, figures, toggleFigures } = controls;
  return (
    <>
      {ZONE_DEFS.map((z) => (
        <label key={z.id} className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={zones[z.id]}
            onChange={() => toggleZone(z.id)}
          />
          <span className="inline-block size-2.5 rounded-full" style={{ background: z.hex }} />
          <span className="text-xs opacity-80">{z.label}</span>
        </label>
      ))}
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={figures}
          onChange={toggleFigures}
        />
        <span className="text-xs opacity-80">Figures</span>
      </label>
    </>
  );
}
