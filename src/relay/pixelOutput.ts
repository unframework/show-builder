import { createSocket, type Socket } from 'node:dgram';

// A UDP pixel transport that EffectSource drives one universe at a time. The
// destination is mutable so the control UI can retarget a running show.
export interface PixelOutput {
  readonly destination: { host: string; port: number };
  setDestination(host: string, port: number): void;
  emit: (universe: number, bytes: Uint8Array) => void;
  close(): void;
}

export abstract class UdpPixelOutput implements PixelOutput {
  protected readonly socket: Socket = createSocket('udp4');

  constructor(
    protected host: string,
    protected port: number,
  ) {}

  get destination(): { host: string; port: number } {
    return { host: this.host, port: this.port };
  }

  setDestination(host: string, port: number): void {
    this.host = host;
    this.port = port;
  }

  abstract emit: (universe: number, bytes: Uint8Array) => void;

  close(): void {
    this.socket.close();
  }
}
