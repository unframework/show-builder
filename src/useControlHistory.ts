import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { EffectControl } from './effects/effectControl';
import {
  restoreSnapshot,
  snapshotSignature,
  type ControlSnapshot,
  type OutputCapable,
} from './controlHistory';

// Edits arriving within this window (a knob drag, a rapid re-tap) fold into one step.
const COALESCE_MS = 300;
// The connect/mount replay arrives as a burst; adopt it as the baseline, don't record it.
const SETTLE_MS = 300;
// A restore's echoes round-trip through the runner; abandon the wait if they never match.
const RESYNC_MS = 1000;
const MAX_DEPTH = 50;

type Control = EffectControl & OutputCapable;
type StateFields = Omit<ControlSnapshot, 'output'>;

interface History {
  past: ControlSnapshot[];
  present: ControlSnapshot | null;
  future: ControlSnapshot[];
  latestState: StateFields | null;
  latestOutput: { host: string; port: number } | null;
  // Signature a restore is waiting to see echoed back; while set, all events are
  // ignored (intermediate steps of the restore) until one matches.
  awaiting: string | null;
  baselineUntil: number;
  lastEditAt: number;
  timer: number;
}

export interface ControlHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

function fresh(): History {
  return {
    past: [],
    present: null,
    future: [],
    latestState: null,
    latestOutput: null,
    awaiting: null,
    baselineUntil: 0,
    lastEditAt: 0,
    timer: 0,
  };
}

export function useControlHistory(control: Control | null): ControlHistory {
  const ref = useRef<History>(fresh());
  const [, render] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!control?.subscribe) return;
    const h = ref.current;
    Object.assign(h, fresh(), { baselineUntil: Date.now() + SETTLE_MS });
    render();

    const ingest = (snap: ControlSnapshot): void => {
      const sig = snapshotSignature(snap);
      if (h.awaiting) {
        if (sig !== h.awaiting) return;
        clearTimeout(h.timer);
        h.awaiting = null;
        h.present = snap;
        render();
        return;
      }
      if (Date.now() < h.baselineUntil || !h.present) {
        h.present = snap;
        render();
        return;
      }
      if (sig === snapshotSignature(h.present)) return;
      const now = Date.now();
      if (now - h.lastEditAt > COALESCE_MS) {
        h.past.push(h.present);
        if (h.past.length > MAX_DEPTH) h.past.shift();
        h.future = [];
      }
      h.present = snap;
      h.lastEditAt = now;
      render();
    };

    const unsubscribe = control.subscribe((event) => {
      if (event.type === 'state') {
        h.latestState = {
          effect: event.effect,
          speed: event.speed,
          brightness: event.brightness,
          bpm: event.bpm,
          params: event.params ?? {},
        };
      } else if (event.type === 'output') {
        h.latestOutput = { host: event.sacnHost, port: event.sacnPort };
      } else {
        return;
      }
      if (h.latestState) ingest({ ...h.latestState, output: h.latestOutput ?? undefined });
    });

    return () => {
      clearTimeout(h.timer);
      unsubscribe();
    };
  }, [control]);

  const travel = useCallback(
    (backward: boolean): void => {
      const h = ref.current;
      if (!control || h.awaiting || !h.present) return;
      const stack = backward ? h.past : h.future;
      if (stack.length === 0) return;

      const target = stack[stack.length - 1];
      const from = h.present;
      if (backward) {
        h.past = h.past.slice(0, -1);
        h.future = [...h.future, from];
      } else {
        h.future = h.future.slice(0, -1);
        h.past = [...h.past, from];
      }
      h.present = target;
      h.awaiting = snapshotSignature(target);

      const issued = restoreSnapshot(control, from, target);
      // Sync (in-tab) restores echo and clear `awaiting` before this returns; a
      // remote runner echoes later, so hold the wait open with a safety timeout.
      if (h.awaiting && issued > 0) {
        clearTimeout(h.timer);
        h.timer = window.setTimeout(() => {
          h.awaiting = null;
          if (h.latestState) h.present = { ...h.latestState, output: h.latestOutput ?? undefined };
          render();
        }, RESYNC_MS);
      } else {
        h.awaiting = null;
      }
      render();
    },
    [control],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        travel(true);
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        travel(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [travel]);

  const h = ref.current;
  return {
    canUndo: !h.awaiting && h.past.length > 0,
    canRedo: !h.awaiting && h.future.length > 0,
    undo: useCallback(() => travel(true), [travel]),
    redo: useCallback(() => travel(false), [travel]),
  };
}
