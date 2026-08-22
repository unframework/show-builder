import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { EffectControl } from '../effects/effectControl';
import { useEditable } from './useEditable';

export function BrightnessControl({
  source,
  size = 'lg',
}: {
  source: EffectControl;
  size?: 'sm' | 'lg';
}) {
  const [brightness, setBrightness] = useState(1);

  useEffect(
    () =>
      source.subscribe?.((event) => {
        if (event.type === 'state') setBrightness(event.brightness);
      }),
    [source],
  );

  const apply = (v: number) => {
    setBrightness(v);
    void source.setBrightness(v);
  };

  const percent = Math.round(brightness * 100);
  const commitPercent = (draft: string) => {
    const n = Number(draft);
    if (Number.isFinite(n)) apply(Math.min(1, Math.max(0, n / 100)));
  };
  const percentField = useEditable(
    percent,
    commitPercent,
    <input
      className="input input-sm input-bordered w-16 text-right font-mono tabular-nums"
      type="number"
      min={0}
      max={100}
      step={1}
    />,
  );

  return (
    <div className="inline-flex items-center gap-x-3">
      <input
        className={clsx(
          'range range-warning w-24 sm:w-40',
          size === 'sm' ? 'range-sm' : 'range-lg',
        )}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={brightness}
        onChange={(e) => apply(Number(e.target.value))}
      />
      {percentField.editing ? (
        <>
          {percentField.input}
          <button className="btn btn-sm btn-primary" onClick={percentField.submit}>
            OK
          </button>
        </>
      ) : (
        <button
          className="w-10 text-right font-mono text-xs tabular-nums"
          onClick={percentField.edit}
        >
          {percent}%
        </button>
      )}
    </div>
  );
}
