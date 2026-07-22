#!/usr/bin/env node
/**
 * fseq-player.js — plays back a rendered xLights .fseq file as live sACN (E1.31)
 * UDP packets, so the relay/simulator sees it exactly as if xLights itself were
 * playing the sequence with "Output to Lights" on. No xLights GUI involvement.
 *
 * Implements the FSEQ v2 format (magic, header, compression block table, sparse
 * range table, zstd-compressed channel data) per the xLights source
 * (src-core/render/FSEQFile.cpp in xLightsSequencer/xLights).
 *
 * Usage:
 *   node fseq-player.js <file.fseq> [--host 127.0.0.1] [--port 5568] [--loop]
 */

'use strict';

const fs = require('fs');
const dgram = require('dgram');
const { spawnSync, spawn } = require('child_process');

// Structured status line for the parent process (relay.js) to parse off stdout —
// distinguishes "process started, decoding" from "actually streaming frames",
// since those used to be conflated (relay marked 'playing' at spawn time, before
// any decode work had even started).
function emitStatus(obj) {
  console.log(`STATUS ${JSON.stringify(obj)}`);
}

const CHANNELS_PER_UNIVERSE = 510; // matches xlights_networks.xml MaxChannels

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  console.log('Usage: node fseq-player.js <file.fseq> [--host 127.0.0.1] [--port 5568] [--loop]');
  process.exit(args.length === 0 ? 1 : 0);
}
const filePath = args[0];
let host = '127.0.0.1';
let port = 5568;
let loop = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--host') host = args[++i];
  else if (args[i] === '--port') port = parseInt(args[++i], 10);
  else if (args[i] === '--loop') loop = true;
}

// ── Read + parse FSEQ v2 header ───────────────────────────────────────────────
const buf = fs.readFileSync(filePath);

if (buf.slice(0, 4).toString('ascii') !== 'PSEQ') {
  console.error('Not a v2 FSEQ file (missing PSEQ magic)');
  process.exit(1);
}

function read3ByteUInt(b, off) {
  return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16);
}

const channelDataOffset = buf.readUInt16LE(4);
const versionMinor = buf[6];
const versionMajor = buf[7];
const headerLen = buf.readUInt16LE(8);
const channelCount = buf.readUInt32LE(10); // per-frame size of the (possibly sparse-compacted) data
const numFrames = buf.readUInt32LE(14);
const stepTimeMs = buf[18];
const compressionType = buf[20] & 0x0f; // 0=none, 1=zstd, 2=zlib
let numBlocks = (buf[20] & 0xf0) << 4;
numBlocks |= buf[21];
const sparseRangeCount = buf[22];

if (versionMajor !== 2) {
  console.error(`Unsupported FSEQ major version ${versionMajor} (only v2 is supported)`);
  process.exit(1);
}
if (compressionType === 2) {
  console.error('zlib-compressed FSEQ not supported by this player (only none/zstd)');
  process.exit(1);
}

console.log(`FSEQ v${versionMajor}.${versionMinor}  frames=${numFrames}  stepTime=${stepTimeMs}ms  ` +
  `channelCount(perFrame)=${channelCount}  compression=${['none', 'zstd'][compressionType]}  blocks=${numBlocks}  sparseRanges=${sparseRangeCount}`);

// ── Compression block table → frame offsets (mirrors V2FSEQFile ctor) ─────────
let readPos = 32;
const frameOffsets = []; // [{firstFrame, fileOffset}]
let lastBlockOffset = channelDataOffset;
for (let i = 0; i < numBlocks; i++) {
  const firstFrame = buf.readUInt32LE(readPos);
  const length = buf.readUInt32LE(readPos + 4);
  if (length > 0) {
    frameOffsets.push({ firstFrame, fileOffset: lastBlockOffset });
    lastBlockOffset += length;
  }
  readPos += 8;
}
const chanDataEnd = lastBlockOffset;

if (compressionType === 0) {
  frameOffsets.push({ firstFrame: 0, fileOffset: channelDataOffset });
} else if (frameOffsets.length === 0) {
  console.error('FSEQ corrupt: compressed but no block table entries found');
  process.exit(1);
}
frameOffsets.push({ firstFrame: numFrames + 2, fileOffset: chanDataEnd });

// ── Sparse range table ────────────────────────────────────────────────────────
const sparseRanges = []; // [{startChan, length}]
for (let i = 0; i < sparseRangeCount; i++) {
  const startChan = read3ByteUInt(buf, readPos);
  const length = read3ByteUInt(buf, readPos + 3);
  sparseRanges.push({ startChan, length });
  readPos += 6;
}

if (readPos !== headerLen) {
  console.warn(`Warning: parsed header length ${readPos} does not match declared headerLen ${headerLen}`);
}

// Total addressable channel span (for sizing the universe output buffer)
let maxChannel = channelCount;
if (sparseRanges.length) {
  maxChannel = sparseRanges.reduce((m, r) => Math.max(m, r.startChan + r.length), 0);
}
const numUniverses = Math.ceil(maxChannel / CHANNELS_PER_UNIVERSE);
console.log(`Channel span=${maxChannel}  universes=1..${numUniverses}  target=${host}:${port}`);
emitStatus({ phase: 'starting', totalFrames: numFrames, totalBlocks: numBlocks });

// ── Lazy, on-demand block decoding ────────────────────────────────────────────
// The old version decompressed every block up front before sending a single
// packet — for a typical render (~300 blocks) that's ~1.5-2s of dead air before
// anything streams, even though only the block containing frame 0 is actually
// needed to start. Instead: decode a block just before it's needed (synchronous
// fallback, a few ms) and prefetch the next block in the background while the
// current one plays, so steady-state playback never blocks on decode at all.
const numRealBlocks = frameOffsets.length - 1; // last entry is a sentinel, not a real block
const frames = new Array(numFrames);
const decodedBlocks = new Set();
const pendingBlocks  = new Set(); // blocks with an async prefetch in flight

function blockFrameRange(b) {
  const firstFrame = frameOffsets[b].firstFrame;
  const nextFirstFrame = Math.min(frameOffsets[b + 1].firstFrame, numFrames);
  return { firstFrame, framesInBlock: nextFirstFrame - firstFrame };
}

function storeDecoded(b, raw) {
  const { firstFrame, framesInBlock } = blockFrameRange(b);
  for (let i = 0; i < framesInBlock; i++) {
    const frameIdx = firstFrame + i;
    if (frameIdx >= numFrames) break;
    frames[frameIdx] = raw.slice(i * channelCount, (i + 1) * channelCount);
  }
  decodedBlocks.add(b);
}

// Synchronous decode — used for the very first block (must be ready before we
// can send frame 0 at all) and as a fallback if playback ever outruns prefetch.
function decodeBlockSync(b) {
  if (decodedBlocks.has(b)) return;
  const { firstFrame, framesInBlock } = blockFrameRange(b);
  if (framesInBlock <= 0) { decodedBlocks.add(b); return; }

  const compressed = buf.slice(frameOffsets[b].fileOffset, frameOffsets[b + 1].fileOffset);
  let raw;
  if (compressionType === 0) {
    raw = compressed;
  } else {
    const result = spawnSync('zstd', ['-d', '-q', '-c'], { input: compressed, maxBuffer: 1 << 30 });
    if (result.status !== 0) {
      console.error(`zstd decompress failed for block ${b}: ${result.stderr}`);
      process.exit(1);
    }
    raw = result.stdout;
  }
  storeDecoded(b, raw);
}

// Async decode — used for background prefetch of upcoming blocks so playback
// never has to wait; failures here just fall back to decodeBlockSync() later.
function decodeBlockAsync(b) {
  if (decodedBlocks.has(b) || pendingBlocks.has(b)) return;
  const { framesInBlock } = blockFrameRange(b);
  if (framesInBlock <= 0) { decodedBlocks.add(b); return; }

  if (compressionType === 0) {
    storeDecoded(b, buf.slice(frameOffsets[b].fileOffset, frameOffsets[b + 1].fileOffset));
    return;
  }

  pendingBlocks.add(b);
  const compressed = buf.slice(frameOffsets[b].fileOffset, frameOffsets[b + 1].fileOffset);
  const child = spawn('zstd', ['-d', '-q', '-c']);
  const chunks = [];
  child.stdout.on('data', (c) => chunks.push(c));
  child.on('error', () => { pendingBlocks.delete(b); }); // fall back to sync decode later
  child.on('close', (code) => {
    pendingBlocks.delete(b);
    if (code === 0 && !decodedBlocks.has(b)) storeDecoded(b, Buffer.concat(chunks));
  });
  child.stdin.end(compressed);
}

// blockForFrame() is called once per frame at playback rate; frames are visited
// in increasing order (aside from the --loop wraparound), so a monotonic
// cursor is O(1) amortized instead of rescanning the block table every frame.
let blockCursor = 0;
function blockForFrame(frameIdx) {
  if (frameOffsets[blockCursor].firstFrame > frameIdx) blockCursor = 0;
  while (blockCursor + 1 < numRealBlocks && frameOffsets[blockCursor + 1].firstFrame <= frameIdx) {
    blockCursor++;
  }
  return blockCursor;
}

function ensureFrameReady(frameIdx) {
  const b = blockForFrame(frameIdx);
  if (!decodedBlocks.has(b)) decodeBlockSync(b); // rare: prefetch didn't win the race
  // Prefetch the next block in the background while this one plays.
  if (b + 1 < numRealBlocks) decodeBlockAsync(b + 1);
}

// Decode just enough to send frame 0 immediately — this is the only decode
// work that blocks playback from starting.
ensureFrameReady(0);

// ── Expand each frame's (possibly sparse-compacted) data to full channel layout ─
function expandFrame(compact) {
  if (!sparseRanges.length) return compact; // already full-width
  const full = Buffer.alloc(numUniverses * CHANNELS_PER_UNIVERSE);
  let compactOffset = 0;
  for (const range of sparseRanges) {
    compact.copy(full, range.startChan, compactOffset, compactOffset + range.length);
    compactOffset += range.length;
  }
  return full;
}

// ── E1.31 (sACN) packet builder — matches relay.js's validation exactly ───────
const ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00]);

function buildPacket(universe, dmxData) {
  const dmxLength = dmxData.length;
  const packet = Buffer.alloc(126 + dmxLength);
  ACN_ID.copy(packet, 4);
  packet.writeUInt32BE(0x00000004, 18);  // ROOT_VECTOR
  packet.writeUInt32BE(0x00000002, 40);  // FRAMING_VECTOR
  packet.writeUInt16BE(universe, 113);
  packet[117] = 0x02;                    // DMP_VECTOR
  packet.writeUInt16BE(dmxLength + 1, 123); // prop count incl. start code
  packet[125] = 0x00;                    // DMX start code
  dmxData.copy(packet, 126);
  return packet;
}

// ── Playback loop ─────────────────────────────────────────────────────────────
const socket = dgram.createSocket('udp4');
let firstFrameSent = false;

function sendFrame(frameIdx) {
  ensureFrameReady(frameIdx);
  const compact = frames[frameIdx];
  if (!compact) return;
  const full = expandFrame(compact);
  for (let u = 1; u <= numUniverses; u++) {
    const start = (u - 1) * CHANNELS_PER_UNIVERSE;
    const dmx = full.slice(start, start + CHANNELS_PER_UNIVERSE);
    const packet = buildPacket(u, dmx);
    socket.send(packet, port, host);
  }
  if (!firstFrameSent) {
    firstFrameSent = true;
    emitStatus({ phase: 'streaming' });
  }
}

let frameIdx = 0;
console.log(`Playing ${numFrames} frames @ ${stepTimeMs}ms/frame${loop ? ' (looping)' : ''}...`);
const startTime = Date.now();

const timer = setInterval(() => {
  sendFrame(frameIdx);
  frameIdx++;
  if (frameIdx >= numFrames) {
    if (loop) {
      frameIdx = 0;
    } else {
      clearInterval(timer);
      console.log(`Done (${((Date.now() - startTime) / 1000).toFixed(1)}s elapsed).`);
      socket.close();
    }
  }
}, stepTimeMs);
