import { useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';
import { DEMO_EFFECTS, type DemoEffectId } from '../engine/demoEffects';

export function EffectControls({ engine }: { engine: CathedralEngine }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [speed, setSpeed] = useState(1);

  return (
    <>
      <label className="ctrl-label">EFFECT</label>
      <select
        className="effect-select"
        value={effect}
        onChange={(e) => {
          const id = e.target.value as DemoEffectId;
          setEffect(id);
          engine.setDemoEffect(id);
        }}
      >
        {DEMO_EFFECTS.map((eff) => (
          <option key={eff.id} value={eff.id}>
            {eff.label}
          </option>
        ))}
      </select>

      <label className="ctrl-label">SPEED</label>
      <input
        className="speed-slider"
        type="range"
        min={0.1}
        max={3}
        step={0.1}
        value={speed}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSpeed(v);
          engine.setDemoSpeed(v);
        }}
      />
    </>
  );
}
