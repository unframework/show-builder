import type { CathedralEngine } from '../engine/CathedralEngine';
import { ConnectionQualityChart } from './ConnectionQualityChart';
import { FigureToggle } from './FigureToggle';
import { SimSwitcher } from './SimSwitcher';
import { ZoneToggles } from './ZoneToggles';

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-base-content/20" />;
}

export function Toolbar({
  engine,
  isLive,
  connected,
  flushStats,
  onToggleNav,
}: {
  engine: CathedralEngine;
  isLive: boolean;
  connected: boolean;
  flushStats: () => number;
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
      <Divider />
      <FigureToggle engine={engine} />
      <Divider />
      {isLive && (
        <span className="badge badge-success gap-1" title="Receiving live data from relay">
          ● LIVE
        </span>
      )}
      {connected && <ConnectionQualityChart flushStats={flushStats} />}
    </div>
  );
}
