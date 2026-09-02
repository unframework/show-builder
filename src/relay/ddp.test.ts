import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDdpPacket, ddpOffset } from './ddp';

test('universe maps to a flat byte offset on the 510-channel grid', () => {
  assert.equal(ddpOffset(1), 0);
  assert.equal(ddpOffset(2), 510);
  assert.equal(ddpOffset(76), 38250);
});

test('packet header carries version, push flag, offset and payload length', () => {
  const data = Uint8Array.from([10, 20, 30]);
  const packet = buildDdpPacket(510, 7, data);

  assert.equal(packet.length, 10 + data.length);
  assert.equal(packet[0], 0x41); // version 1 + push
  assert.equal(packet[1], 7); // sequence
  assert.equal(packet[3], 1); // display device id
  assert.equal(packet.readUInt32BE(4), 510);
  assert.equal(packet.readUInt16BE(8), data.length);
  assert.deepEqual([...packet.subarray(10)], [10, 20, 30]);
});

test('sequence field keeps only the low nibble', () => {
  assert.equal(buildDdpPacket(0, 0x1f, new Uint8Array())[1], 0x0f);
});
