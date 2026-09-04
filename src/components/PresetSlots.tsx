import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import clsx from 'clsx';
import type { EffectControl } from '../effects/effectControl';
import type { OutputCapable } from '../controlHistory';
import { usePresets } from '../usePresets';

type Source = (EffectControl & OutputCapable) | null;

function ExportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

// Numbered slot strip for saving and recalling looks (effect + knobs). Click a
// filled slot to arm it — it snaps on the next beat. Modifiers cover save/clear/
// immediate so no extra editor UI is needed.
export function PresetSlots({ source }: { source: Source }) {
  const { slots, activeIndex, armedIndex, load, loadNow, save, clear, exportBank, importBank } =
    usePresets(source);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importBank(file);
    setImportError(result.ok ? null : result.message);
  };

  const onClick = (i: number, e: MouseEvent) => {
    setImportError(null);
    if (e.altKey && e.shiftKey)
      loadNow(i); // immediate, no beat alignment
    else if (e.altKey) clear(i);
    else if (e.shiftKey || !slots[i])
      save(i); // save on Shift, or into an empty slot
    else load(i); // arm to fire next beat
  };

  // Number keys 1..N arm the matching slot, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= slots.length) {
        e.preventDefault();
        load(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, slots.length]);

  return (
    <div className="flex items-center gap-2">
      <div className="join" role="group" aria-label="Preset slots">
        {slots.map((slot, i) => {
          const filled = !!slot;
          const active = activeIndex === i;
          const armed = armedIndex === i;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => onClick(i, e)}
              className={clsx(
                'btn btn-sm btn-square join-item font-mono tabular-nums',
                active && 'btn-primary',
                !active && filled && 'btn-neutral',
                !filled && 'btn-ghost opacity-50',
                armed && 'preset-armed',
              )}
              title={
                filled
                  ? `Preset ${i + 1} — click: load on next beat · Shift: overwrite · Alt: clear · Alt+Shift: load now`
                  : `Preset ${i + 1} (empty) — click to save the current look`
              }
              aria-label={`Preset ${i + 1}${filled ? '' : ' (empty)'}${active ? ', active' : ''}${
                armed ? ', armed' : ''
              }`}
              aria-pressed={active}
            >
              {filled ? i + 1 : '+'}
            </button>
          );
        })}
      </div>
      <div className="join" role="group" aria-label="Preset file">
        <button
          type="button"
          onClick={exportBank}
          className="btn btn-ghost btn-sm btn-square join-item"
          title="Export presets to file"
          aria-label="Export presets"
        >
          <ExportIcon />
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="btn btn-ghost btn-sm btn-square join-item"
          title="Import presets from file"
          aria-label="Import presets"
        >
          <ImportIcon />
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={onFile}
      />
      {importError && (
        <span className="text-error text-xs" role="alert">
          {importError}
        </span>
      )}
    </div>
  );
}
