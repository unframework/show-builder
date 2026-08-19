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
    <div className="app">
      {engine && <Toolbar engine={engine} isLive={relay.isLive} />}
      <div className="body-row">
        <Sidenav
          sequences={relay.sequences}
          nowPlaying={relay.nowPlaying}
          connected={relay.connected}
          onSelect={relay.selectSequence}
          onViewXml={setXmlName}
        />
        <div className="canvas-wrap" ref={setContainer} />
      </div>
      {!engine && <div className="loading">{error ? `Error: ${error}` : 'Loading…'}</div>}
      {xmlName && (
        <XmlModal name={xmlName} fetchXml={relay.fetchXml} onClose={() => setXmlName(null)} />
      )}
    </div>
  );
}
