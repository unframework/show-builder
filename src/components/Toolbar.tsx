import type { CathedralEngine } from '../engine/CathedralEngine';
import { ConnectionQualityChart } from './ConnectionQualityChart';
import { SimControls } from './SimControls';
import { SimSwitcher } from './SimSwitcher';
import { useSimControls } from './useSimControls';

function Divider() {
  return <div className="h-4 w-px shrink-0 bg-base-content/20" />;
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
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
  const controls = useSimControls(engine);

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
      <div className="hidden items-center gap-3 lg:flex">
        <Divider />
        <SimControls controls={controls} />
        <Divider />
      </div>
      {isLive && (
        <span className="badge badge-success gap-1" title="Receiving live data from relay">
          ● LIVE
        </span>
      )}
      {connected && <ConnectionQualityChart flushStats={flushStats} />}
      <div className="dropdown dropdown-end ml-auto lg:hidden">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-sm btn-square"
          aria-label="Sim controls"
        >
          <GearIcon />
        </div>
        <div
          tabIndex={0}
          className="dropdown-content z-30 mt-2 flex w-56 flex-col gap-3 rounded-box border border-base-300 bg-base-200 p-3 shadow-lg"
        >
          <SimControls controls={controls} />
        </div>
      </div>
    </div>
  );
}
