import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { controlCommand, type ControlOutput, type EffectEvent } from '../effects/controlMessages';
import type { EffectSource } from '../effects/EffectSource';
import type { PixelOutput } from '../relay/pixelOutput';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface ControlServerOptions {
  host: string;
  port: number;
  uiDir: string;
  source: EffectSource;
  output: PixelOutput;
  onPersist: () => void;
  onPersistPresets: () => void;
}

// Serves the built control UI over HTTP and relays its commands to the running
// EffectSource, rebroadcasting the resulting knob state to every connected UI.
export function startControlServer({
  host,
  port,
  uiDir,
  source,
  output,
  onPersist,
  onPersistPresets,
}: ControlServerOptions): void {
  let latestState = source.getState();
  let latestPresets = source.getPresetsEvent();
  const outputEvent = (): ControlOutput => {
    const { host: sacnHost, port: sacnPort } = output.destination;
    return { type: 'output', sacnHost, sacnPort };
  };

  const server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
    const file = rel === '/' || rel === '.' ? 'runner.html' : rel.replace(/^(\.\.(\/|\\|$))+/, '');
    void serveFile(join(uiDir, file), res);
  });

  const wss = new WebSocketServer({ server, path: '/fx' });
  const broadcast = (event: EffectEvent): void => {
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  };

  source.subscribe((event) => {
    if (event.type === 'state') {
      latestState = event;
      onPersist();
    } else if (event.type === 'presets') {
      latestPresets = event;
      onPersistPresets();
    }
    broadcast(event);
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify(latestState));
    ws.send(JSON.stringify(outputEvent()));
    ws.send(JSON.stringify(latestPresets));
    ws.on('message', (data) => {
      const parsed = controlCommand.safeParse(JSON.parse(data.toString()));
      if (!parsed.success) return;
      const cmd = parsed.data;
      switch (cmd.type) {
        case 'set-effect':
          source.setEffect(cmd.id);
          break;
        case 'set-speed':
          source.setSpeed(cmd.speed);
          break;
        case 'set-brightness':
          source.setBrightness(cmd.brightness);
          break;
        case 'set-bpm':
          source.setBpm(cmd.bpm);
          break;
        case 'set-running':
          source.setRunning(cmd.running);
          break;
        case 'set-param':
          source.setParam(cmd.effect, cmd.layer, cmd.key, cmd.field, cmd.value);
          break;
        case 'set-ramp':
          source.setRamp(cmd.effect, cmd.layer, cmd.ramp);
          break;
        case 'set-output':
          output.setDestination(cmd.host, cmd.port);
          broadcast(outputEvent());
          onPersist();
          break;
        case 'cue-beat':
          source.cueBeat();
          break;
        case 'select-preset':
          source.selectPreset(cmd.slot);
          break;
        case 'clear-preset':
          source.clearPreset(cmd.slot);
          break;
        case 'set-presets':
          source.setPresets(cmd.slots);
          break;
      }
    });
  });

  server.listen(port, host, () =>
    console.log(
      `[runner] control UI on http://${host === '0.0.0.0' ? '<this-host>' : host}:${port}`,
    ),
  );
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
