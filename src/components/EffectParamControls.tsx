import { useEffect, useRef, useState, type PointerEvent } from 'react';
import clsx from 'clsx';
import type { EffectParams } from '../effects/controlMessages';
import { EFFECT_KNOBS, type DemoEffectId } from '../effects/demoEffects';
import type { EffectControl } from '../effects/effectControl';
import type { Range } from '../effects/knobs';

// Pixels of travel before the drag axis locks; the lock point (not the initial
// press) is the reference the value scrubs from.
const LOCK_PX = 6;
// Travel along the axis that spans the knob's full range.
const SCRUB_RANGE_PX = 300;
// Perpendicular drift that arms cancel: release here reverts to the start value.
const CANCEL_PERP_PX = 200;

type Axis = 'x' | 'y';

interface DragState {
  axis: Axis;
  refX: number;
  refY: number;
  curX: number;
  curY: number;
  value: number;
  startValue: number;
  cancel: boolean;
}

interface Scrub {
  startX: number;
  startY: number;
  startValue: number;
  axis: Axis | null;
  refX: number;
  refY: number;
  cancel: boolean;
}

const decimalsFor = (step: number) => Math.min(3, Math.max(0, Math.ceil(-Math.log10(step))));

function PenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 opacity-50"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

// Tap-and-drag scrubber: press, move to lock an axis, then up/left increases and
// down/right decreases. A full-window overlay draws the axis line + live delta.
function ScrubValue({
  range,
  value,
  onChange,
}: {
  range: Range;
  value: number;
  onChange: (v: number) => void;
}) {
  const scrub = useRef<Scrub | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const decimals = decimalsFor(range.step);
  const fmt = (v: number) => v.toFixed(decimals);

  const snap = (v: number) => {
    const clamped = Math.min(range.max, Math.max(range.min, v));
    return range.min + Math.round((clamped - range.min) / range.step) * range.step;
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrub.current = {
      startX: e.clientX,
      startY: e.clientY,
      startValue: value,
      axis: null,
      refX: 0,
      refY: 0,
      cancel: false,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = scrub.current;
    if (!s) return;
    if (!s.axis) {
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (Math.hypot(dx, dy) < LOCK_PX) return;
      s.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      s.refX = e.clientX;
      s.refY = e.clientY;
    }
    const along = s.axis === 'x' ? e.clientX - s.refX : s.refY - e.clientY;
    const perp = s.axis === 'x' ? Math.abs(e.clientY - s.refY) : Math.abs(e.clientX - s.refX);
    const next = snap(s.startValue + (along * (range.max - range.min)) / SCRUB_RANGE_PX);
    s.cancel = perp >= CANCEL_PERP_PX;
    onChange(next);
    setDrag({
      axis: s.axis,
      refX: s.refX,
      refY: s.refY,
      curX: e.clientX,
      curY: e.clientY,
      value: next,
      startValue: s.startValue,
      cancel: s.cancel,
    });
  };

  const end = () => {
    const s = scrub.current;
    scrub.current = null;
    if (s?.cancel) onChange(s.startValue);
    setDrag(null);
  };

  const shown = drag ? drag.startValue : value;

  return (
    <>
      <span
        className={clsx(
          'inline-flex min-w-[5rem] cursor-ns-resize touch-none select-none items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 font-mono text-base font-semibold tabular-nums',
          drag?.cancel ? 'border-error text-error' : 'border-base-content/20 hover:border-warning',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <PenIcon />
        {fmt(shown)}
      </span>
      {drag && <ScrubOverlay drag={drag} fmt={fmt} />}
    </>
  );
}

function ScrubOverlay({ drag, fmt }: { drag: DragState; fmt: (v: number) => string }) {
  const tipX = drag.axis === 'x' ? drag.curX : drag.refX;
  const tipY = drag.axis === 'x' ? drag.refY : drag.curY;
  const delta = drag.value - drag.startValue;
  const label = `${delta >= 0 ? '+' : ''}${fmt(delta)}`;
  return (
    <div
      className={clsx(
        'pointer-events-none fixed inset-0 z-50',
        drag.cancel ? 'text-error' : 'text-warning',
      )}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line
          x1={drag.refX}
          y1={drag.refY}
          x2={tipX}
          y2={tipY}
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <circle cx={tipX} cy={tipY} r={6} fill="currentColor" />
        <text
          x={tipX}
          y={tipY - 34}
          fill="currentColor"
          fontSize={18}
          textAnchor="middle"
          className="font-mono font-bold"
        >
          {label}
        </text>
        <text
          x={tipX}
          y={tipY - 14}
          fill="#ffffff"
          fontSize={16}
          textAnchor="middle"
          className="font-mono font-bold"
        >
          {fmt(drag.value)}
        </text>
      </svg>
    </div>
  );
}

// Knob panel for the selected effect: each tunable exposes a scrub value for its
// base plus one for its beat-kick amount. Mirrors the effect's persisted params
// from the state stream and dispatches edits through the same control transport.
export function EffectParamControls({ source }: { source: EffectControl }) {
  const [effect, setEffect] = useState<DemoEffectId>('zone');
  const [params, setParams] = useState<EffectParams>({});

  useEffect(
    () =>
      source.subscribe?.((event) => {
        if (event.type !== 'state') return;
        setEffect(event.effect);
        setParams(event.params ?? {});
      }),
    [source],
  );

  const schema = EFFECT_KNOBS[effect];
  if (!schema) return null;
  const values = params[effect] ?? {};

  return (
    <section className="bg-base-300 px-2 py-3 sm:px-4">
      <div className="flex flex-col gap-2">
        {Object.entries(schema).map(([key, def]) => {
          const v = values[key] ?? def.default;
          return (
            <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="w-28 text-sm font-semibold uppercase tracking-wide opacity-60">
                {def.label}
              </span>
              <ScrubValue
                range={def.base}
                value={v.base}
                onChange={(x) => void source.setParam(effect, key, 'base', x)}
              />
              <span className="text-sm uppercase tracking-wide opacity-40">kick</span>
              <ScrubValue
                range={def.kick}
                value={v.kick}
                onChange={(x) => void source.setParam(effect, key, 'kick', x)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
