import type { EffectControl } from '../effects/effectControl';
import type { OutputCapable } from '../controlHistory';
import { useControlHistory } from '../useControlHistory';

function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h1" />
    </svg>
  );
}

export function HistoryControls({ source }: { source: (EffectControl & OutputCapable) | null }) {
  const { canUndo, canRedo, undo, redo } = useControlHistory(source);
  return (
    <div className="join">
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        className="btn btn-ghost btn-xs btn-square join-item"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        className="btn btn-ghost btn-xs btn-square join-item"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <RedoIcon />
      </button>
    </div>
  );
}
