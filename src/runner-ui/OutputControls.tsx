import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useEditable } from '../components/useEditable';
import type { WsControl } from './wsControl';

// Live sACN destination as separate host and port fields, each mirroring the BPM
// knob's read/SET/OK pattern. Seeds from the runner's `output` event.
export function OutputControls({ source }: { source: WsControl }) {
  const [dest, setDest] = useState<{ host: string; port: number } | null>(null);

  useEffect(
    () =>
      source.subscribe?.((event) => {
        if (event.type === 'output') setDest({ host: event.sacnHost, port: event.sacnPort });
      }),
    [source],
  );

  const commitHost = (raw: string): void => {
    const host = raw.trim();
    if (host && dest) {
      void source.setOutput(host, dest.port);
    }
  };
  const commitPort = (raw: string): void => {
    const port = Number(raw);
    if (Number.isInteger(port) && port > 0 && port <= 65535 && dest) {
      void source.setOutput(dest.host, port);
    }
  };

  const hostField = useEditable(
    dest?.host ?? '',
    commitHost,
    <input className="input input-sm input-bordered w-36 font-mono" />,
  );
  const portField = useEditable(
    dest?.port ?? '',
    commitPort,
    <input
      className="input input-sm input-bordered w-20 font-mono"
      type="number"
      min={1}
      max={65535}
    />,
  );

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide opacity-50">sACN</span>
      <EditableValue label={dest?.host ?? '…'} field={hostField} disabled={!dest} />
      <span className="opacity-50">:</span>
      <EditableValue label={dest ? String(dest.port) : '…'} field={portField} disabled={!dest} />
    </div>
  );
}

type EditableField = ReturnType<typeof useEditable>;

function EditableValue({
  label,
  field,
  disabled,
}: {
  label: string;
  field: EditableField;
  disabled: boolean;
}) {
  if (field.editing) {
    return (
      <>
        {field.input}
        <button className="btn btn-sm btn-primary" onClick={field.submit}>
          OK
        </button>
      </>
    );
  }
  return (
    <>
      <span
        className={clsx(
          'flex border border-base-content/10 bg-transparent font-mono tabular-nums px-2 py-1',
          'text-md items-center rounded-md',
        )}
      >
        {label}
      </span>
      <button className="btn btn-sm btn-outline" onClick={field.edit} disabled={disabled}>
        SET
      </button>
    </>
  );
}
