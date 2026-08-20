import { useEffect, useState } from 'react';

const BAR_COUNT = 20;
const SAMPLE_MS = 1000;

function barStyle(fraction: number): { className: string; height: string } {
  if (fraction === 0) return { className: 'bg-base-content/10', height: '100%' };
  if (fraction >= 0.98) return { className: 'bg-green-500', height: '100%' };
  if (fraction >= 0.9) return { className: 'bg-yellow-400', height: '80%' };
  if (fraction >= 0.5) return { className: 'bg-orange-500', height: '50%' };
  return { className: 'bg-red-500', height: '20%' };
}

export function ConnectionQualityChart({ flushStats }: { flushStats: () => number }) {
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  useEffect(() => {
    const id = window.setInterval(() => {
      const quality = flushStats();
      setBars((prev) => [...prev.slice(1), quality]);
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [flushStats]);

  return (
    <div
      className="inline-flex h-4 items-end gap-px"
      title="Connection quality — frame delivery/sec over the last 20s (40fps expected)"
    >
      {bars.map((fraction, i) => {
        const { className, height } = barStyle(fraction);
        return <div key={i} className={`w-0.5 rounded-sm ${className}`} style={{ height }} />;
      })}
    </div>
  );
}
