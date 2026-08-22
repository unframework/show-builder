import { effectEvent, type ControlCommand, type EffectEvent } from '../effects/controlMessages';
import type { EffectControl } from '../effects/effectControl';

const RECONNECT_MS = 3000;

export interface WsControl extends EffectControl {
  // Repoint the runner's sACN output; runner-only, absent from the in-tab adapter.
  setOutput(host: string, port: number): Promise<void>;
  close(): void;
}

export interface WsControlHandlers {
  onConnected(connected: boolean): void;
}

// Satisfies the same EffectControl contract as the in-tab adapter, but forwards
// each call to the runner as a JSON command and relays the runner's event stream
// back to subscribers. Auto-reconnects; the runner's state snapshot on (re)connect
// keeps the UI in sync.
export function createWsControl(url: string, handlers: WsControlHandlers): WsControl {
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectTimer = 0;
  const listeners = new Set<(event: EffectEvent) => void>();

  const connect = (): void => {
    socket = new WebSocket(url);
    socket.onopen = () => handlers.onConnected(true);
    socket.onclose = () => {
      handlers.onConnected(false);
      if (!closed) reconnectTimer = window.setTimeout(connect, RECONNECT_MS);
    };
    socket.onmessage = (evt) => {
      const parsed = effectEvent.safeParse(JSON.parse(evt.data));
      if (parsed.success) for (const listener of listeners) listener(parsed.data);
    };
  };
  connect();

  const send = async (command: ControlCommand): Promise<void> => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  };

  return {
    setEffect: (id) => send({ type: 'set-effect', id }),
    setSpeed: (speed) => send({ type: 'set-speed', speed }),
    setBrightness: (brightness) => send({ type: 'set-brightness', brightness }),
    setBpm: (bpm) => send({ type: 'set-bpm', bpm }),
    setRunning: (running) => send({ type: 'set-running', running }),
    setOutput: (host, port) => send({ type: 'set-output', host, port }),
    cueBeat: () => send({ type: 'cue-beat' }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      closed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}
