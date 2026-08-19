import { z } from 'zod';

export const nowPlayingStatus = z.enum(['idle', 'rendering', 'playing', 'error']);
export type NowPlayingStatus = z.infer<typeof nowPlayingStatus>;

export const nowPlaying = z.object({
  name: z.string().nullable(),
  status: nowPlayingStatus,
  message: z.string().nullable(),
  updatedAt: z.number().optional(),
});
export type NowPlaying = z.infer<typeof nowPlaying>;

const roseCell = z.object({
  petal: z.number(),
  cell: z.string(),
  r: z.number(),
  g: z.number(),
  b: z.number(),
});

export const relayMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('universe'), universe: z.number(), channels: z.array(z.number()) }),
  z.object({ type: z.literal('cells'), source: z.string().optional(), data: z.array(roseCell) }),
  nowPlaying.extend({ type: z.literal('now-playing') }),
]);
export type RelayMessage = z.infer<typeof relayMessage>;

export const sequencesResponse = z.object({
  sequences: z.array(z.string()),
  nowPlaying,
});
