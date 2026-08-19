import type { CathedralEngine } from '../engine/CathedralEngine';
import { EffectControls } from './EffectControls';
import { SimSwitcher } from './SimSwitcher';
import { ZoneToggles } from './ZoneToggles';

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-base-content/20" />;
}

export function Toolbar({ engine, isLive }: { engine: CathedralEngine; isLive: boolean }) {
  return (
    <div className="navbar min-h-0 flex-wrap gap-3 border-b border-base-300 bg-base-200 px-4 py-2">
      <SimSwitcher />
      <Divider />
      <ZoneToggles engine={engine} />
      <Divider />
      <EffectControls engine={engine} />
      {isLive && (
        <span className="badge badge-success gap-1" title="Receiving live data from relay">
          ● LIVE
        </span>
      )}
      <span className="ml-auto text-xs opacity-50">
        Drag to orbit · Scroll to zoom · Right-drag to pan · Double-click to reset view
      </span>
    </div>
  );
}
