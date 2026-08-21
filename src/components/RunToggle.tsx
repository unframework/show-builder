import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { EffectControl } from '../effects/effectControl';

export function RunToggle({ source, size = 'lg' }: { source: EffectControl; size?: 'sm' | 'lg' }) {
  const [running, setRunning] = useState(true);

  useEffect(
    () =>
      source.subscribe?.((event) => {
        if (event.type === 'state') setRunning(event.running);
      }),
    [source],
  );

  return (
    <button
      className={clsx(
        'btn',
        size === 'sm' ? 'btn-sm' : 'btn-lg',
        running ? 'btn-error' : 'btn-success',
      )}
      onClick={() => {
        const next = !running;
        setRunning(next);
        void source.setRunning(next);
      }}
    >
      {running ? 'STOP' : 'START'}
    </button>
  );
}
