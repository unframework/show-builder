import { useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';

export function FigureToggle({ engine }: { engine: CathedralEngine }) {
  const [show, setShow] = useState(true);

  const toggle = () => {
    const next = !show;
    setShow(next);
    engine.setFiguresVisible(next);
  };

  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" className="checkbox checkbox-xs" checked={show} onChange={toggle} />
      <span className="text-xs opacity-80">Figures</span>
    </label>
  );
}
