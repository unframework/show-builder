import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { DEMO_EFFECTS, type DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';
import { useEditable } from './useEditable';
import { useTapTempo } from './useTapTempo';

export function EffectControls({ source }: { source: EffectControl }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [running, setRunning] = useState(true);
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
      className="input input-lg input-bordered w-20"
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
        setEffect(event.effect);
        setRunning(event.running);
        setSpeed(event.speed);
        setBpm(event.bpm);
      }),
    [source],
  );

  return (
    <section className="max-h-[50dvh] shrink-0 overflow-y-auto bg-base-300 px-2 py-3 sm:px-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <button
              className={clsx('btn btn-lg', running ? 'btn-error' : 'btn-success')}
              onClick={() => {
                const next = !running;
                setRunning(next);
                void source.setRunning(next);
              }}
            >
              {running ? 'STOP' : 'START'}
            </button>

            <div className="inline-flex items-center gap-x-4">
              <span className="text-base opacity-50">EFFECT</span>
              <select
                className="select select-lg select-bordered"
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

            <div className="inline-flex items-center gap-x-4">
              <span className="text-base opacity-50">SPEED</span>
              <input
                className="range range-lg range-warning w-32 sm:w-60"
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
              <span className="input input-lg flex border border-base-content/10 bg-transparent w-16 items-center justify-center font-mono tabular-nums">
                {speed.toFixed(1)}
              </span>
            </div>

            <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
              <span key={beatFlash} className="beat-flash text-base opacity-50">
                TEMPO
              </span>
              <button
                className={clsx(
                  'btn btn-lg relative overflow-visible',
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
                  <button className="btn btn-lg btn-primary" onClick={bpmField.submit}>
                    OK
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-lg btn-outline"
                    onClick={() => applyBpm(Math.round(bpm))}
                  >
                    INT
                  </button>
                  <span className="input input-lg flex border border-base-content/10 bg-transparent w-20 items-center text-left font-mono tabular-nums">
                    {bpm}
                  </span>
                  <button className="btn btn-lg btn-outline" onClick={bpmField.edit}>
                    SET
                  </button>
                </>
              )}
              <span className="text-base opacity-50">BPM</span>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 basis-80" aria-hidden />
      </div>
    </section>
  );
}
