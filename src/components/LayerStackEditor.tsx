import { useState } from 'react';
import type { LayerDef } from '../effects/controlMessages';
import { LAYER_KIND_IDS, type LayerKindId } from '../effects/demoEffects';

const BLENDS: LayerDef['blend'][] = ['over', 'add', 'screen', 'multiply'];

// A layer's default name is its kind id, suffixed to stay unique within the stack.
function uniqueName(kind: string, layers: LayerDef[]): string {
  const taken = new Set(layers.map((l) => l.name));
  if (!taken.has(kind)) return kind;
  for (let i = 2; ; i++) {
    const candidate = `${kind}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Edits to the live stack: every op computes the next LayerDef[] and hands it to
// the engine via one set-layers, which reseeds new/swapped layers and drops removed
// ones. Order is paint order, bottom-first.
export function LayerStackEditor({
  layers,
  onChange,
}: {
  layers: LayerDef[];
  onChange: (layers: LayerDef[]) => void;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= layers.length) return;
    const next = layers.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const setBlend = (i: number, blend: LayerDef['blend']) =>
    onChange(layers.map((l, k) => (k === i ? { ...l, blend } : l)));
  const setKind = (i: number, kind: string) =>
    onChange(layers.map((l, k) => (k === i ? { ...l, kind } : l)));
  const remove = (i: number) => onChange(layers.filter((_, k) => k !== i));
  const add = (kind: LayerKindId) =>
    onChange([...layers, { name: uniqueName(kind, layers), kind, blend: 'over' }]);

  return (
    <div className="col-span-full flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">layers</span>
      {layers.map((l, i) => (
        <div key={l.name} className="flex items-center gap-1 text-xs">
          <div className="join">
            <button
              className="btn btn-xs join-item"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              title="move down (paints earlier)"
            >
              ↑
            </button>
            <button
              className="btn btn-xs join-item"
              disabled={i === layers.length - 1}
              onClick={() => move(i, 1)}
              title="move up (paints later)"
            >
              ↓
            </button>
          </div>
          <span className="w-16 shrink-0 truncate font-mono opacity-70" title={l.name}>
            {l.name}
          </span>
          <select
            className="select select-xs select-bordered"
            value={l.kind}
            onChange={(e) => setKind(i, e.target.value)}
          >
            {LAYER_KIND_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <select
            className="select select-xs select-bordered"
            value={l.blend}
            onChange={(e) => setBlend(i, e.target.value as LayerDef['blend'])}
          >
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <button
            className="btn btn-xs btn-ghost text-error"
            onClick={() => remove(i)}
            title="remove"
          >
            ×
          </button>
        </div>
      ))}
      <AddLayer onAdd={add} />
    </div>
  );
}

function AddLayer({ onAdd }: { onAdd: (kind: LayerKindId) => void }) {
  const [kind, setKind] = useState<LayerKindId>(LAYER_KIND_IDS[0]);
  return (
    <div className="flex items-center gap-1">
      <select
        className="select select-xs select-bordered"
        value={kind}
        onChange={(e) => setKind(e.target.value as LayerKindId)}
      >
        {LAYER_KIND_IDS.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <button className="btn btn-xs btn-outline" onClick={() => onAdd(kind)}>
        + add
      </button>
    </div>
  );
}
