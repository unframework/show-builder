import { useState } from 'react';
import { EffectControls } from './components/EffectControls';
import { Sidenav } from './components/Sidenav';
import { Toolbar } from './components/Toolbar';
import { XmlModal } from './components/XmlModal';
import { useEffectSource } from './useEffectSource';
import { useEngine } from './useEngine';
import { useRelay } from './relay/useRelay';

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
          <span className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 text-xs opacity-50 lg:inline">
            Drag to orbit · Scroll to zoom · Right-drag to pan · Double-click to reset view
          </span>
        </div>
      </div>
      <div className="shrink-0 flex flex-col px-2 py-3 gap-4 border-t border-base-300 bg-base-200">
        <div className="flex flex-wrap gap-8 items-center">
          <h3 className="text-xs uppercase tracking-wide opacity-50 sm:px-4">Effects</h3>
          {error ? (
            <span className="text-error">Error: {error}</span>
          ) : (
            !engine && <span className="loading loading-dots loading-lg text-base-content/50" />
          )}
        </div>
        <div className="rounded-lg overflow-hidden">
          <EffectControls source={effectSource} />
        </div>
      </div>

      {xmlName && (
        <XmlModal name={xmlName} fetchXml={relay.fetchXml} onClose={() => setXmlName(null)} />
      )}
    </div>
  );
}
