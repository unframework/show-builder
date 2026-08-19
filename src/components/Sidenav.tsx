import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { NowPlaying, NowPlayingStatus } from '../relay/protocol';

interface SidenavProps {
  sequences: string[];
  nowPlaying: NowPlaying;
  connected: boolean;
  onSelect: (name: string) => void;
  onViewXml: (name: string) => void;
}

export function Sidenav({ sequences, nowPlaying, connected, onSelect, onViewXml }: SidenavProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-base-300 bg-base-200">
      <h3 className="px-4 py-2 text-xs uppercase tracking-wide opacity-50">Sequences</h3>
      <ul
        className={clsx(
          'menu w-full flex-1 flex-nowrap gap-0.5 overflow-y-auto',
          !connected && 'pointer-events-none opacity-40',
        )}
      >
        {sequences.map((name) => {
          const current = name === nowPlaying.name;
          return (
            <li key={name}>
              <a
                className={clsx('flex items-center gap-2', current && 'menu-active')}
                onClick={() => onSelect(name)}
              >
                <StatusDot current={current} status={nowPlaying.status} />
                <span className="flex-1 truncate text-xs" title={name}>
                  {name}
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewXml(name);
                  }}
                >
                  XML
                </button>
              </a>
            </li>
          );
        })}
      </ul>
      <StatusFooter connected={connected} nowPlaying={nowPlaying} />
    </aside>
  );
}

function StatusDot({ current, status }: { current: boolean; status: NowPlayingStatus }) {
  if (current && status === 'rendering') {
    return <span className="loading loading-spinner loading-xs text-warning" />;
  }
  const color =
    current && status === 'playing'
      ? 'bg-success'
      : current && status === 'error'
        ? 'bg-error'
        : 'bg-base-content/30';
  return <span className={clsx('size-2 shrink-0 rounded-full', color)} />;
}

function StatusFooter({ connected, nowPlaying }: { connected: boolean; nowPlaying: NowPlaying }) {
  const rendering = connected && nowPlaying.status === 'rendering';
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!rendering) return;
    setSecs(0);
    const start = Date.now();
    const id = window.setInterval(
      () => setSecs(Math.max(0, Math.floor((Date.now() - start) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [rendering, nowPlaying.name]);

  let text: string;
  let cls = 'text-base-content/60';
  if (!connected) {
    text = 'relay not connected';
    cls = 'text-warning';
  } else if (nowPlaying.status === 'error') {
    text = nowPlaying.message ?? 'error';
    cls = 'text-error';
  } else if (nowPlaying.status === 'rendering') {
    text = `rendering ${nowPlaying.name}… (${secs}s)`;
  } else if (nowPlaying.name) {
    text = `${nowPlaying.status}: ${nowPlaying.name}`;
  } else {
    text = 'idle — select a sequence';
  }

  return (
    <div className={clsx('mt-auto border-t border-base-300 px-4 py-2 text-xs', cls)}>{text}</div>
  );
}
