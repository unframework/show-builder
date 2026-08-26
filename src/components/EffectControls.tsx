import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { DEMO_EFFECTS, type DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';
import { useEditable } from './useEditable';
import { useTapTempo } from './useTapTempo';

export function EffectControls({ source }: { source: EffectControl }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [speed, setSpeed] = useState(1);
  const [bpm, setBpm] = useState(120);
  const [pulse, setPulse] = useState(0);
  const [beatFlash, setBeatFlash] = useState(0);

  const applyBpm = useCallback(
    (v: number) => {
      setBpm(v);
      void source.setBpm(v);
    },
    [source],
  );
  const { tap, live } = useTapTempo(applyBpm);

  const commitBpm = (draft: string) => {
    const v = Number(draft);
    if (Number.isFinite(v) && v > 0) applyBpm(Math.round(v * 10) / 10);
  };
  const bpmField = useEditable(
    bpm,
    commitBpm,
    <input
      className="input input-sm input-bordered w-20"
      type="number"
      min={30}
      max={300}
      step={0.1}
    />,
  );

  useEffect(
    () =>
      source.subscribe?.((event) => {
        if (event.type === 'beat') {
          setBeatFlash((n) => n + 1);
          return;
        }
        if (event.type !== 'state') return;
        setEffect(event.effect);
        setSpeed(event.speed);
        setBpm(event.bpm);
      }),
    [source],
  );

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">EFFECT</span>
        <select
          className="select select-sm select-bordered w-full"
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
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">SPEED</span>
        <div className="flex items-center gap-2">
          <input
            className="range range-sm range-warning w-full min-w-0"
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
          <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums opacity-80">
            {speed.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          key={beatFlash}
          className="beat-flash text-xs font-semibold uppercase tracking-wide opacity-60"
        >
          TEMPO
        </span>
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
        {bpmField.editing ? (
          <>
            {bpmField.input}
            <button className="btn btn-sm btn-primary" onClick={bpmField.submit}>
              OK
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-sm btn-outline" onClick={() => applyBpm(Math.round(bpm))}>
              INT
            </button>
            <span className="input input-sm flex w-16 items-center border border-base-content/10 bg-transparent text-left font-mono tabular-nums">
              {bpm}
            </span>
            <button className="btn btn-sm btn-outline" onClick={bpmField.edit}>
              SET
            </button>
          </>
        )}
        <span className="text-xs font-semibold uppercase tracking-wide opacity-60">BPM</span>
      </div>
    </>
  );
}
