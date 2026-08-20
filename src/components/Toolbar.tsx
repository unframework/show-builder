import type { CathedralEngine } from '../engine/CathedralEngine';
import { SimSwitcher } from './SimSwitcher';
import { ZoneToggles } from './ZoneToggles';

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-base-content/20" />;
}

export function Toolbar({
  engine,
  isLive,
  onToggleNav,
}: {
  engine: CathedralEngine;
  isLive: boolean;
  onToggleNav: () => void;
}) {
  return (
    <div className="navbar min-h-0 flex-wrap gap-3 border-b border-base-300 bg-base-200 px-2 py-2 sm:px-4">
      <button
        className="btn btn-ghost btn-sm btn-square lg:hidden"
        onClick={onToggleNav}
        aria-label="Toggle sequence list"
      >
        ☰
      </button>
      <SimSwitcher />
      <Divider />
      <ZoneToggles engine={engine} />
      {isLive && (
        <span className="badge badge-success gap-1" title="Receiving live data from relay">
          ● LIVE
        </span>
      )}
      <span className="ml-auto hidden text-xs opacity-50 lg:inline">
        Drag to orbit · Scroll to zoom · Right-drag to pan · Double-click to reset view
      </span>
    </div>
  );
}
