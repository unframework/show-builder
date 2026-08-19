import { useState } from 'react';
import { Sidenav } from './components/Sidenav';
import { Toolbar } from './components/Toolbar';
import { XmlModal } from './components/XmlModal';
import { useEngine } from './useEngine';
import { useRelay } from './relay/useRelay';

export function App() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const { engine, error } = useEngine(container);
  const relay = useRelay(engine);
  const [xmlName, setXmlName] = useState<string | null>(null);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base-300">
      {engine && <Toolbar engine={engine} isLive={relay.isLive} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidenav
          sequences={relay.sequences}
          nowPlaying={relay.nowPlaying}
          connected={relay.connected}
          onSelect={relay.selectSequence}
          onViewXml={setXmlName}
        />
        <div className="canvas-wrap relative flex-1 overflow-hidden" ref={setContainer} />
      </div>

      {!engine && (
        <div className="fixed inset-0 grid place-items-center text-sm">
          {error ? (
            <span className="text-error">Error: {error}</span>
          ) : (
            <span className="loading loading-dots loading-lg text-base-content/50" />
          )}
        </div>
      )}

      {xmlName && (
        <XmlModal name={xmlName} fetchXml={relay.fetchXml} onClose={() => setXmlName(null)} />
      )}
    </div>
  );
}
