import { z } from 'zod';

const vec2 = z.tuple([z.number(), z.number()]);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const cellPolygons = z.object({
  cells: z.array(z.object({ cell: z.string(), ring: z.array(vec2) })),
});

const mainArches = z.object({
  arches: z.array(
    z.object({
      universe: z.number(),
      universe_start_channel: z.number().optional(),
      x_position_m: z.number(),
      pixel_polygons: z.array(z.array(vec2).nullable()),
    }),
  ),
});

const miniArches = z.object({
  arches: z.array(
    z.object({
      universe: z.number(),
      x_position_m: z.number(),
      pixel_positions: z.array(vec2),
    }),
  ),
});

const quadArches = z.object({
  faces: z.array(
    z.object({
      universe: z.number(),
      universe_start_channel: z.number(),
      span_axis: z.enum(['x', 'z']),
      fixed_axis_pos_m: z.number(),
      pixel_positions: z.array(vec2),
    }),
  ),
});

const spire = z.object({
  strands: z.array(
    z.object({
      universe: z.number(),
      universe_start_channel: z.number(),
      pixel_positions: z.array(vec3),
    }),
  ),
});

const spirelets = z.object({
  pixels: z.array(
    z.object({
      corner: z.string(),
      position: vec3,
      universe: z.number(),
      universe_start_channel: z.number(),
    }),
  ),
});

const canopy = z.object({
  runs: z.array(
    z.object({
      universe: z.number(),
      universe_start_channel: z.number(),
      pixel_positions: z.array(vec3),
    }),
  ),
});

const wash = z.object({
  pixels: z.array(
    z.object({
      aim: z.enum(['up', 'down']),
      position: vec3,
      universe: z.number(),
      universe_start_channel: z.number(),
    }),
  ),
});

export type CellPolygons = z.infer<typeof cellPolygons>;
export type MainArches = z.infer<typeof mainArches>;
export type MiniArches = z.infer<typeof miniArches>;
export type QuadArches = z.infer<typeof quadArches>;
export type Spire = z.infer<typeof spire>;
export type Spirelets = z.infer<typeof spirelets>;
export type Canopy = z.infer<typeof canopy>;
export type Wash = z.infer<typeof wash>;

export interface PixelMap {
  cellPolygons: CellPolygons;
  mainArches: MainArches;
  miniLeft: MiniArches;
  miniRight: MiniArches;
  quads: QuadArches[];
  spires: Spire[];
  spirelets: Spirelets;
  canopy: Canopy;
  wash: Wash;
}

const QUAD_NAMES = [
  'back-bottom-left',
  'back-bottom-right',
  'back-top-left',
  'back-top-right',
  'front-top-left',
  'front-top-right',
];

const SPIRE_NAMES = ['front-left', 'front-right', 'back-left', 'back-right'];

// Fetches and validates one pixel-map file. The browser reads over HTTP, a Node
// runner off disk — the assembly below is agnostic to which.
export type JsonLoader = <T>(file: string, schema: z.ZodType<T>) => Promise<T>;

export async function assemblePixelMap(load: JsonLoader): Promise<PixelMap> {
  const [
    cellPolygonsData,
    mainArchesData,
    miniLeft,
    miniRight,
    quads,
    spires,
    spireletsData,
    canopyData,
    washData,
  ] = await Promise.all([
    load('cell-polygons.json', cellPolygons),
    load('arch-led-positions.json', mainArches),
    load('arch-led-positions-mini-left.json', miniArches),
    load('arch-led-positions-mini-right.json', miniArches),
    Promise.all(QUAD_NAMES.map((n) => load(`arch-led-positions-quad-${n}.json`, quadArches))),
    Promise.all(SPIRE_NAMES.map((n) => load(`spire-led-positions-${n}.json`, spire))),
    load('spires-corners-led-positions.json', spirelets),
    load('canopy-led-positions.json', canopy),
    load('wash-led-positions.json', wash),
  ]);

  return {
    cellPolygons: cellPolygonsData,
    mainArches: mainArchesData,
    miniLeft,
    miniRight,
    quads,
    spires,
    spirelets: spireletsData,
    canopy: canopyData,
    wash: washData,
  };
}

// Local (playa / dev): pixel-map served alongside the app. Otherwise the wiki copy.
export function loadPixelMap(): Promise<PixelMap> {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const base = isLocalHost ? '/pixel-map' : 'https://wiki.thegothicfolly.com/sim/pixel-map';
  return assemblePixelMap(async (file, schema) => {
    const res = await fetch(`${base}/${file}`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return schema.parse(await res.json());
  });
}
