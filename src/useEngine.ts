import { useEffect, useState } from 'react';
import { CathedralEngine } from './engine/CathedralEngine';
import { loadPixelMap } from './scene/pixelData';

export function useEngine(container: HTMLElement | null): {
  engine: CathedralEngine | null;
  error: string | null;
} {
  const [engine, setEngine] = useState<CathedralEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!container) return;
    let disposed = false;
    let created: CathedralEngine | null = null;

    void loadPixelMap()
      .then((pixelMap) => {
        if (disposed) return;
        created = new CathedralEngine(container, pixelMap);
        setEngine(created);
      })
      .catch((e: unknown) => {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      disposed = true;
      created?.dispose();
      setEngine(null);
    };
  }, [container]);

  useEffect(() => {
    if (!engine || !container) return;
    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [engine, container]);

  return { engine, error };
}
