import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { controlCommand, type ControlState } from '../effects/controlMessages';
import type { EffectSource } from '../effects/EffectSource';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface ControlServerOptions {
  port: number;
  uiDir: string;
  source: EffectSource;
}

// Serves the built control UI over HTTP and relays its commands to the running
// EffectSource, rebroadcasting the resulting knob state to every connected UI.
export function startControlServer({ port, uiDir, source }: ControlServerOptions): void {
  const state: ControlState = { type: 'state', effect: 'zone', speed: 1, bpm: 120 };

  const server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
    const file = rel === '/' || rel === '.' ? 'runner.html' : rel.replace(/^(\.\.(\/|\\|$))+/, '');
    void serveFile(join(uiDir, file), res);
  });

  const wss = new WebSocketServer({ server, path: '/fx' });
  const broadcast = (): void => {
    const msg = JSON.stringify(state);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  };

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify(state));
    ws.on('message', (data) => {
      const parsed = controlCommand.safeParse(JSON.parse(data.toString()));
      if (!parsed.success) return;
      const cmd = parsed.data;
      switch (cmd.type) {
        case 'set-effect':
          source.setEffect(cmd.id);
          state.effect = cmd.id;
          break;
        case 'set-speed':
          source.setSpeed(cmd.speed);
          state.speed = cmd.speed;
          break;
        case 'set-bpm':
          source.setBpm(cmd.bpm);
          state.bpm = cmd.bpm;
          break;
        case 'cue-beat':
          source.cueBeat();
          return;
      }
      broadcast();
    });
  });

  server.listen(port, () => console.log(`[runner] control UI on http://localhost:${port}`));
}

async function serveFile(path: string, res: ServerResponse): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    res.setHeader('Content-Type', CONTENT_TYPES[extname(path)] ?? 'application/octet-stream');
    createReadStream(path).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}
