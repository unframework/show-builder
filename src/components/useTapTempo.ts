import { useCallback, useEffect, useRef, useState } from 'react';

// A gap longer than this ends the current phrase; the next tap starts fresh.
const PHRASE_GAP_MS = 2000;
const WINDOW = 8;
const MIN_BPM = 30;
const MAX_BPM = 300;
// Intervals further than this fraction from the median are off-beat re-cues, not
// tempo. Human tapping jitter stays well under it; a mid-phrase re-cue lands past.
const OUTLIER_TOLERANCE = 0.3;

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const filteredMean = (intervals: number[]) => {
  const center = median(intervals);
  const margin = OUTLIER_TOLERANCE * center;

  const filtered =
    intervals.length < 4 ? intervals : intervals.filter((x) => Math.abs(x - center) <= margin);

  const averaged = filtered.length >= 2 ? filtered : intervals;
  return averaged.reduce((a, b) => a + b, 0) / averaged.length;
};

export function useTapTempo(onBpm: (bpm: number) => void) {
  const onBpmRef = useRef(onBpm);
  onBpmRef.current = onBpm;

  const tapsRef = useRef<number[]>([]);
  const timerRef = useRef<number | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    return () => {
      timerRef.current = null;
    };
  }, []);

  const tap = useCallback((now: number) => {
    const taps = tapsRef.current;

    taps.push(now);
    if (taps.length > WINDOW) taps.shift();

    const timerId = (timerRef.current = window.setTimeout(() => {
      if (timerRef.current !== timerId) return;

      tapsRef.current = [];
      timerRef.current = null;
      setLive(false);
    }, PHRASE_GAP_MS));

    setLive(true);
    if (taps.length > 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const bpm = Math.round(600000 / filteredMean(intervals)) / 10;
      onBpmRef.current(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
    }
  }, []);

  return { tap, live };
}
