import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { BrightnessControl } from '../components/BrightnessControl';
import { EffectControls } from '../components/EffectControls';
import { EffectParamControls } from '../components/EffectParamControls';
import { HistoryControls } from '../components/HistoryControls';
import { RunToggle } from '../components/RunToggle';
import { OutputControls } from './OutputControls';
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
      onConnected: setConnected,
    });
    setControl(c);
    return () => c.close();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-base-300 text-base-content">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 border-b border-base-100">
        <h1 className="text-sm font-semibold uppercase tracking-wide">The Gothic Folly</h1>
        <div className="flex flex-wrap items-center gap-4">
          {control && <HistoryControls source={control} />}
          {control && <RunToggle source={control} size="sm" />}
          {control && <BrightnessControl source={control} size="sm" />}
          {control && <OutputControls source={control} />}
          <span className={clsx('badge badge-sm', connected ? 'badge-success' : 'badge-error')}>
            {connected ? '● CONNECTED' : '○ OFFLINE'}
          </span>
        </div>
      </header>
      {control && (
        <div className="mb-auto">
          <EffectControls source={control} />
          <EffectParamControls source={control} />
        </div>
      )}
    </div>
  );
}
