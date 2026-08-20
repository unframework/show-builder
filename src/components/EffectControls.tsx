import { useState } from 'react';
import { DEMO_EFFECTS, type DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';

export function EffectControls({ source }: { source: EffectControl }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [speed, setSpeed] = useState(1);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs opacity-50">EFFECT</span>
      <select
        className="select select-sm select-bordered"
        value={effect}
        onChange={(e) => {
          const id = e.target.value as DemoEffectId;
          setEffect(id);
          void source.setEffect(id);
        }}
      >
        {DEMO_EFFECTS.map((eff) => (
          <option key={eff.id} value={eff.id}>
            {eff.label}
          </option>
        ))}
      </select>

      <span className="text-xs opacity-50">SPEED</span>
      <input
        className="range range-xs range-warning w-32 sm:w-60"
        type="range"
        min={0.1}
        max={3}
        step={0.1}
        value={speed}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSpeed(v);
          void source.setSpeed(v);
        }}
      />
    </div>
  );
}
