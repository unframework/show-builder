import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { EffectsPanel } from '../components/EffectsPanel';
import { createWsControl, type WsControl } from './wsControl';

// Same origin as the page: the runner serves both directly, and the Vite dev
// server proxies /fx to the runner. Works over any HTTPS proxy unchanged.
const { protocol, host } = window.location;
const CONTROL_WS = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/fx`;

export function RunnerApp() {
  const [connected, setConnected] = useState(false);
  const [control, setControl] = useState<WsControl | null>(null);

  useEffect(() => {
    const c = createWsControl(CONTROL_WS, {
      onState: () => {},
      onConnected: setConnected,
    });
    setControl(c);
    return () => c.close();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-base-100 text-base-content">
      <header className="flex items-center justify-between px-4 py-3">
        <h1 className="text-sm font-semibold uppercase tracking-wide">Effect Runner</h1>
        <span className={clsx('badge badge-sm', connected ? 'badge-success' : 'badge-error')}>
          {connected ? '● CONNECTED' : '○ OFFLINE'}
        </span>
      </header>
      {control && (
        <div className="mt-auto">
          <EffectsPanel source={control} />
        </div>
      )}
    </div>
  );
}
