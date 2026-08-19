import type { CathedralEngine } from '../engine/CathedralEngine';
import { EffectControls } from './EffectControls';
import { SimSwitcher } from './SimSwitcher';
import { ZoneToggles } from './ZoneToggles';

export function Toolbar({ engine, isLive }: { engine: CathedralEngine; isLive: boolean }) {
  return (
    <div className="toolbar">
      <SimSwitcher />
      <div className="sep" />
      <ZoneToggles engine={engine} />
      <div className="sep" />
      <EffectControls engine={engine} />
      {isLive && (
        <span className="live-badge" title="Receiving live data from relay">
          ● LIVE
        </span>
      )}
      <span className="info">
        Drag to orbit · Scroll to zoom · Right-drag to pan · Double-click to reset view
      </span>
    </div>
  );
}
