import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { DEMO_EFFECTS, type DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';
import { useTapTempo } from './useTapTempo';

export function EffectControls({ source }: { source: EffectControl }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [speed, setSpeed] = useState(1);
  const [bpm, setBpm] = useState(120);
  const [pulse, setPulse] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('120');

  const applyBpm = useCallback(
    (v: number) => {
      setBpm(v);
      void source.setBpm(v);
    },
    [source],
  );
  const { tap, live } = useTapTempo(applyBpm);

  const commitDraft = () => {
    const v = Number(draft);
    if (Number.isFinite(v) && v > 0) applyBpm(Math.round(v * 10) / 10);
    setEditing(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs opacity-50">EFFECT</span>
      <select
        className="select select-sm select-bordered"
        value={effect}
        onChange={(e) => {
          const id = e.target.value as DemoEffectId;
          setEffect(id);
          void source.setEffect(id);
        }}
      >
        {DEMO_EFFECTS.map((eff) => (
          <option key={eff.id} value={eff.id}>
            {eff.label}
          </option>
        ))}
      </select>

      <span className="text-xs opacity-50">SPEED</span>
      <input
        className="range range-xs range-warning w-32 sm:w-60"
        type="range"
        min={0.1}
        max={3}
        step={0.1}
        value={speed}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSpeed(v);
          void source.setSpeed(v);
        }}
      />

      <span className="text-xs opacity-50">TEMPO</span>
      <button
        className={clsx(
          'btn btn-sm relative overflow-visible',
          live ? 'btn-error' : 'btn-outline btn-warning',
        )}
        onPointerDown={() => {
          void source.cueBeat();
          tap(performance.now());
          setPulse((p) => p + 1);
        }}
      >
        {pulse > 0 && (
          <span
            key={pulse}
            className="tap-pulse pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-error"
          />
        )}
        TAP
      </button>
      {editing ? (
        <>
          <input
            className="input input-sm input-bordered w-20"
            type="number"
            min={30}
            max={300}
            step={0.1}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              else if (e.key === 'Escape') setEditing(false);
            }}
          />
          <button className="btn btn-sm btn-primary" onClick={commitDraft}>
            OK
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-sm btn-outline" onClick={() => applyBpm(Math.round(bpm))}>
            INT
          </button>
          <span className="input input-sm input-bordered flex w-20 items-center text-left font-mono tabular-nums">
            {bpm}
          </span>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setDraft(String(bpm));
              setEditing(true);
            }}
          >
            SET
          </button>
        </>
      )}
      <span className="text-xs opacity-50">BPM</span>
    </div>
  );
}
