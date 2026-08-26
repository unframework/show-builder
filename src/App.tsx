import { useState } from 'react';
import { BrightnessControl } from './components/BrightnessControl';
import { EffectPanel } from './components/EffectPanel';
import { HistoryControls } from './components/HistoryControls';
import { RunToggle } from './components/RunToggle';
import { Sidenav } from './components/Sidenav';
import { Toolbar } from './components/Toolbar';
import { XmlModal } from './components/XmlModal';
import { useEffectSource } from './useEffectSource';
import { useEngine } from './useEngine';
import { useRelay } from './relay/useRelay';

function ResetViewIcon() {
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
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function App() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const { engine, error } = useEngine(container);
  const relay = useRelay(engine);
  const effectSource = useEffectSource(engine, relay.isLive);
  const [xmlName, setXmlName] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base-300">
      {engine && (
        <Toolbar
          engine={engine}
          isLive={relay.isLive}
          connected={relay.connected}
          flushStats={relay.flushStats}
          onToggleNav={() => setNavOpen((open) => !open)}
        />
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidenav
          sequences={relay.sequences}
          nowPlaying={relay.nowPlaying}
          connected={relay.connected}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onSelect={relay.selectSequence}
          onViewXml={setXmlName}
        />
        <div className="canvas-wrap relative flex-1 overflow-hidden" ref={setContainer}>
          {engine && (
            <button
              type="button"
              onClick={() => engine.resetView()}
              className="btn btn-ghost btn-sm btn-square absolute right-2 top-2 z-10 bg-base-100/60 backdrop-blur"
              title="Reset view"
              aria-label="Reset view"
            >
              <ResetViewIcon />
            </button>
          )}
          <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 text-xs opacity-50 lg:inline">
            Drag to orbit · Scroll to zoom · Right-drag to pan · Double-click to reset view
          </span>
        </div>
      </div>
      <div className="shrink-0 flex flex-col px-2 py-3 gap-4 border-t border-base-300 bg-base-200">
        <div className="flex flex-wrap gap-x-3 gap-y-2 sm:gap-8 items-center">
          <h3 className="hidden text-xs uppercase tracking-wide opacity-50 sm:block sm:px-4">
            Effects
          </h3>
          {engine && <HistoryControls source={effectSource} />}
          {engine && <RunToggle source={effectSource} size="sm" />}
          {engine && <BrightnessControl source={effectSource} size="sm" />}
          {error ? (
            <span className="text-error">Error: {error}</span>
          ) : (
            !engine && <span className="loading loading-dots loading-lg text-base-content/50" />
          )}
        </div>
        <div className="max-h-[55dvh] overflow-y-auto rounded-lg">
          <EffectPanel source={effectSource} />
        </div>
      </div>

      {xmlName && (
        <XmlModal name={xmlName} fetchXml={relay.fetchXml} onClose={() => setXmlName(null)} />
      )}
    </div>
  );
}
