import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { NowPlaying } from '../relay/protocol';

interface SidenavProps {
  sequences: string[];
  nowPlaying: NowPlaying;
  connected: boolean;
  onSelect: (name: string) => void;
  onViewXml: (name: string) => void;
}

export function Sidenav({ sequences, nowPlaying, connected, onSelect, onViewXml }: SidenavProps) {
  return (
    <div className={clsx('sidenav', !connected && 'disconnected')}>
      <h3>Sequences</h3>
      <div className="seq-list">
        {sequences.map((name) => {
          const current = name === nowPlaying.name;
          return (
            <div
              key={name}
              className={clsx('seq-row', current && 'current')}
              onClick={() => onSelect(name)}
            >
              <span className={clsx('seq-status-dot', current && nowPlaying.status)} />
              <span className="seq-name" title={name}>
                {name}
              </span>
              <span
                className="seq-xml-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewXml(name);
                }}
              >
                XML
              </span>
            </div>
          );
        })}
      </div>
      <StatusFooter connected={connected} nowPlaying={nowPlaying} />
    </div>
  );
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
  let cls: string | undefined;
  if (!connected) {
    text = 'relay not connected';
    cls = 'disconnected';
  } else if (nowPlaying.status === 'error') {
    text = nowPlaying.message ?? 'error';
    cls = 'error';
  } else if (nowPlaying.status === 'rendering') {
    text = `rendering ${nowPlaying.name}… (${secs}s)`;
  } else if (nowPlaying.name) {
    text = `${nowPlaying.status}: ${nowPlaying.name}`;
  } else {
    text = 'idle — select a sequence';
  }

  return <div className={clsx('sidenav-status', cls)}>{text}</div>;
}
