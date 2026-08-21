import { createSocket, type Socket } from 'node:dgram';

// E1.31 (sACN) packet builder — matches relay.js's validation exactly (and
// mirrors relay/fseq-player.js so the relay receives runner frames identically).
const ACN_ID = Buffer.from([
  0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00,
]);

export function buildDataPacket(universe: number, sequence: number, dmx: Uint8Array): Buffer {
  const packet = Buffer.alloc(126 + dmx.length);
  ACN_ID.copy(packet, 4);
  packet.writeUInt32BE(0x00000004, 18); // ROOT_VECTOR
  packet.writeUInt32BE(0x00000002, 40); // FRAMING_VECTOR
  packet[111] = sequence & 0xff; // sequence number
  packet.writeUInt16BE(universe, 113);
  packet[117] = 0x02; // DMP_VECTOR
  packet.writeUInt16BE(dmx.length + 1, 123); // property count incl. start code
  packet[125] = 0x00; // DMX start code
  Buffer.from(dmx.buffer, dmx.byteOffset, dmx.length).copy(packet, 126);
  return packet;
}

// UDP sink for EffectSource: one sACN packet per universe per frame, with a
// per-universe rolling sequence number as the protocol requires.
export class SacnOutput {
  private readonly socket: Socket = createSocket('udp4');
  private readonly sequence = new Map<number, number>();

  constructor(
    private host: string,
    private port: number,
  ) {}

  get destination(): { host: string; port: number } {
    return { host: this.host, port: this.port };
  }

  setDestination(host: string, port: number): void {
    this.host = host;
    this.port = port;
  }

  emit = (universe: number, bytes: Uint8Array): void => {
    const seq = ((this.sequence.get(universe) ?? 0) + 1) & 0xff;
    this.sequence.set(universe, seq);
    this.socket.send(buildDataPacket(universe, seq, bytes), this.port, this.host);
  };

  close(): void {
    this.socket.close();
  }
}
