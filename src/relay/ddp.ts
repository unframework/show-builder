import { UdpPixelOutput } from './pixelOutput';

// DDP addresses one flat channel buffer instead of discrete universes, so an
// E1.31 universe becomes a byte offset into that buffer. Falcon controllers lay
// pixels out on the same 510-channel grid (largest multiple of 3 that fits a
// 512-channel universe — whole RGB pixels, no straddling the boundary).
const E131_UNIVERSE_SIZE = 510;

export const ddpOffset = (universe: number): number => (universe - 1) * E131_UNIVERSE_SIZE;

const HEADER_LEN = 10;
const FLAG_VER1 = 0x40;
const FLAG_PUSH = 0x01; // render this data immediately
const ID_DISPLAY = 1; // default output device

export function buildDdpPacket(offset: number, sequence: number, data: Uint8Array): Buffer {
  const packet = Buffer.alloc(HEADER_LEN + data.length);
  packet[0] = FLAG_VER1 | FLAG_PUSH;
  packet[1] = sequence & 0x0f;
  packet[2] = 0x00; // data type: standard RGB
  packet[3] = ID_DISPLAY;
  packet.writeUInt32BE(offset, 4);
  packet.writeUInt16BE(data.length, 8);
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(packet, HEADER_LEN);
  return packet;
}

// One DDP packet per universe, offset onto the controller's flat buffer. The
// sequence counter rolls 1–15; 0 is reserved to mean "sequencing unused".
export class DdpOutput extends UdpPixelOutput {
  private sequence = 0;

  emit = (universe: number, bytes: Uint8Array): void => {
    this.sequence = (this.sequence % 15) + 1;
    this.socket.send(
      buildDdpPacket(ddpOffset(universe), this.sequence, bytes),
      this.port,
      this.host,
    );
  };
}
