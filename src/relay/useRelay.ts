import { useCallback, useEffect, useRef, useState } from 'react';
import type { CathedralEngine } from '../engine/CathedralEngine';
import {
  nowPlaying as nowPlayingSchema,
  relayMessage,
  sequencesResponse,
  type NowPlaying,
} from './protocol';

const HTTP_BASE = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';
const LIVE_TIMEOUT_MS = 3000;
const RECONNECT_MS = 3000;
const POLL_MS = 10000;
const EXPECTED_FPS = 40;

const IDLE: NowPlaying = { name: null, status: 'idle', message: null };

export interface RelayState {
  sequences: string[];
  nowPlaying: NowPlaying;
  connected: boolean;
  isLive: boolean;
  flushStats: () => number;
  selectSequence: (name: string) => void;
  fetchXml: (name: string) => Promise<string>;
}

// Live relay client: streams sACN frames into the engine, tracks which sequence
// is playing, and drives sequence selection. `connected` is HTTP reachability of
// the relay; `isLive` is whether DMX frames are currently arriving.
export function useRelay(engine: CathedralEngine | null): RelayState {
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const [sequences, setSequences] = useState<string[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>(IDLE);
  const [connected, setConnected] = useState(false);
  const [isLive, setIsLive] = useState(false);

  const nowPlayingRef = useRef(nowPlaying);
  nowPlayingRef.current = nowPlaying;
  const liveTimer = useRef(0);

  const frameCounts = useRef(new Map<string, number>());
  const lastFlush = useRef(performance.now());

  const markLive = useCallback(() => {
    setIsLive(true);
    clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => setIsLive(false), LIVE_TIMEOUT_MS);
  }, []);

  // Frame-delivery quality since the previous call, as a 0..1 fraction of the
  // expected 40fps (averaged across the streams active in the window). Frames
  // arrive one message per universe/cell-source per frame, so we normalize by
  // stream count. Returns 0 when no frame arrived at all. Resets the accumulator.
  const flushStats = useCallback((): number => {
    const now = performance.now();
    const elapsedSec = (now - lastFlush.current) / 1000;
    lastFlush.current = now;

    const counts = frameCounts.current;
    let total = 0;
    for (const count of counts.values()) total += count;
    const active = counts.size;
    counts.clear();

    if (total === 0) return 0;
    const avg = total / active;
    const expected = EXPECTED_FPS * elapsedSec;
    return Math.min(1, avg / expected);
  }, []);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch(`${HTTP_BASE}/api/sequences`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = sequencesResponse.parse(await res.json());
      setSequences(data.sequences);
      setNowPlaying(data.nowPlaying);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer = 0;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => void fetchSequences();
      ws.onclose = () => {
        setIsLive(false);
        if (!closed) reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
      };
      ws.onmessage = (evt) => {
        const parsed = relayMessage.safeParse(JSON.parse(evt.data));
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === 'now-playing') {
          setNowPlaying(nowPlayingSchema.parse(msg));
          return;
        }
        const eng = engineRef.current;
        let stream: string;
        if (msg.type === 'universe') {
          eng?.applyUniverse(msg.universe, msg.channels);
          stream = `u${msg.universe}`;
        } else {
          eng?.applyRoseCells(msg.data);
          stream = `cells:${msg.source ?? ''}`;
        }
        frameCounts.current.set(stream, (frameCounts.current.get(stream) ?? 0) + 1);
        markLive();
      };
    };

    connect();
    void fetchSequences();
    const pollTimer = window.setInterval(() => void fetchSequences(), POLL_MS);

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      clearTimeout(liveTimer.current);
      ws?.close();
    };
  }, [fetchSequences, markLive]);

  const selectSequence = useCallback((name: string) => {
    const current = nowPlayingRef.current;
    if (current.status === 'rendering' && current.name === name) return;

    // Flip to 'rendering' immediately; the real transitions arrive via the WS
    // 'now-playing' broadcast and supersede this.
    setNowPlaying({ name, status: 'rendering', message: null });

    void (async () => {
      try {
        const res = await fetch(`${HTTP_BASE}/api/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setNowPlaying({ name, status: 'error', message: err.error ?? 'play request failed' });
        }
      } catch (e) {
        setNowPlaying({
          name,
          status: 'error',
          message: e instanceof Error ? e.message : 'play request failed',
        });
      }
    })();
  }, []);

  const fetchXml = useCallback(async (name: string) => {
    const res = await fetch(`${HTTP_BASE}/api/sequence-xml?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }, []);

  return { sequences, nowPlaying, connected, isLive, flushStats, selectSequence, fetchXml };
}
