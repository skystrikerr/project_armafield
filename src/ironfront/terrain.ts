import * as THREE from "three";
import {
  clamp,
  fbm,
  lerp,
  mulberry32,
  pick,
  range,
  ridge,
  smoothstep,
  type Rand,
} from "./random";
import type { Team } from "./units";

/**
 * The battlefield: a heightfield valley with a road running the length of it,
 * three villages sitting on the capture points, and enough tree cover and
 * stone to make a tank commander think twice about the direct route.
 */

export const MAP_HALF = 340;
export const GRID = 136;
export const CELL = (MAP_HALF * 2) / GRID;

export type Zone = {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
};

export const ZONES: Zone[] = [
  { id: "A", name: "Vineyard", x: -155, z: 30, radius: 34 },
  { id: "B", name: "Crossroads", x: 0, z: -15, radius: 36 },
  { id: "C", name: "Rail Yard", x: 155, z: 25, radius: 34 },
];

export const BASES: Record<Team, { x: number; z: number }> = {
  blue: { x: 0, z: 195 },
  red: { x: 0, z: -195 },
};

/** Airstrips sit behind each base line. Planes spawn along them. */
export const AIRFIELDS: Record<Team, { x: number; z: number; heading: number }> = {
  blue: { x: -115, z: 240, heading: Math.PI },
  red: { x: 115, z: -240, heading: 0 },
};

/** A building, sandbag wall or wreck: an oriented box that stops bullets. */
export type Obstacle = {
  x: number;
  y: number;
  z: number;
  /** Half extents. */
  hw: number;
  hh: number;
  hd: number;
  rot: number;
  /** Broadphase radius around the centre. */
  radius: number;
  /** Vehicles can crush it (sandbags, fences) but not drive through walls. */
  solidToVehicles: boolean;
};

export type Prop = {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  kind: string;
};

/** A tree that a tank can shove over. */
export type TreeProp = Prop & {
  /** 0 = upright, 1 = flat on the ground. */
  fall: number;
  fallDir: number;
  falling: boolean;
};

const ROAD_NODES: { x: number; z: number }[] = [
  { x: 0, z: 300 },
  { x: 18, z: 150 },
  { x: -10, z: 70 },
  { x: 0, z: -15 },
  { x: 15, z: -110 },
  { x: 0, z: -300 },
];

/**
 * The river. It runs down the right of the map and both roads cross it, which
 * is what puts the two bridges where the references have them: one where the
 * north road crosses and one on the lateral.
 */
const RIVER_NODES: { x: number; z: number }[] = [
  { x: 150, z: -320 },
  { x: 118, z: -180 },
  { x: 96, z: -70 },
  { x: 88, z: 10 },
  { x: 104, z: 110 },
  { x: 138, z: 230 },
  { x: 160, z: 330 },
];

/** Where a road crosses the water, and how wide a deck it needs. */
const BRIDGES: { x: number; z: number; yaw: number; span: number }[] = [
  { x: 92, z: -14, yaw: Math.PI / 2, span: 46 },
  { x: 100, z: 96, yaw: Math.PI / 2 - 0.24, span: 44 },
];

const LATERAL_NODES: { x: number; z: number }[] = [
  { x: -230, z: 55 },
  { x: -155, z: 30 },
  { x: -70, z: 6 },
  { x: 0, z: -15 },
  { x: 80, z: 4 },
  { x: 155, z: 25 },
  { x: 235, z: 48 },
];

/** Craters, generated per map so shelled ground differs between them. */
export type Crater = { x: number; z: number; r: number; depth: number };

/** One trench run: a zigzag polyline the ground is cut down along. */
export type Trench = { nodes: { x: number; z: number }[] };

function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

function polylineDistance(px: number, pz: number, nodes: { x: number; z: number }[]) {
  let best = Infinity;
  for (let i = 0; i < nodes.length - 1; i++) {
    const d = segmentDistance(px, pz, nodes[i].x, nodes[i].z, nodes[i + 1].x, nodes[i + 1].z);
    if (d < best) best = d;
  }
  return best;
}


/* ================================================================== */
/*  Biomes                                                             */
/* ================================================================== */

/**
 * A map's recipe. Everything that makes one place look and fight unlike
 * another lives here: how the ground is shaped, what colour it is, what grows
 * on it and how thickly. The generator itself is the same for every map — a
 * new map is this object plus a seed, not new code.
 */
export type Biome = {
  id: string;
  /** Landform amplitudes, in metres. */
  land: {
    rolling: number;
    hills: number;
    /** Exponent on the ridged noise: higher makes peaks sharper and rarer. */
    hillPower: number;
    detail: number;
    /** Depth of the central valley the capture line sits in. 0 for flat ground. */
    valley: number;
    /** Horizontal scale multiplier — below 1 makes everything broader. */
    scale: number;
  };
  ground: {
    lush: number;
    grass: number;
    dry: number;
    dirt: number;
    rock: number;
    /** Colour the tops go, and the height it starts. */
    high: number;
    highAt: number;
  };
  trees: {
    count: number;
    kinds: TreeKind[];
    /** Multiplies the noise that decides where woodland clumps. */
    density: number;
    minScale: number;
    maxScale: number;
  };
  rocks: { count: number; minScale: number; maxScale: number };
  clutter: { count: number; bushChance: number };
  /**
   * A river cut through the map, or null for dry ground. `level` is the water
   * surface height; the channel is carved down to `depth` below it so the
   * banks read as banks rather than a painted stripe.
   */
  river: { width: number; depth: number; level: number; colour: number } | null;
  /**
   * A standing body of water, carved as a bowl. Shares the river's waterline
   * and colour, so a map wanting only a lake still declares a river for the
   * surface and gives it width 0.
   */
  lake: { x: number; z: number; r: number; depth: number } | null;
  /**
   * A sea along one edge of the map, with a beach and a bluff behind it. The
   * assault maps are built round this: everything west of `beachAt` is water,
   * then sand, then the ground climbs a bluff onto the plateau where the
   * fighting is.
   */
  coast: {
    /** World X the waterline sits at; everything below it is sea. */
    shoreX: number;
    /** How far inland the sand runs before the bluff starts. */
    beach: number;
    /** How far again the bluff takes to climb, and by how much. */
    bluff: number;
    rise: number;
    sand: number;
    surf: number;
  } | null;
  /** Zigzag trench lines cut into the ground, with spoil thrown up in front. */
  trenches: { lines: number; depth: number; width: number };
  /** Concrete emplacements along the bluff, and obstacles on the sand. */
  emplacements: { bunkers: number; hedgehogs: number; craft: number };
  /** Patchwork farmland, as on the Normandy plateau. 0 for none. */
  fields: number;
  /** Shell holes. `count` 0 leaves the ground unbroken. */
  craters: { count: number; minR: number; maxR: number; depth: number };
  /**
   * Sky and fog, so a desert does not sit under a temperate haze. `sky` is the
   * colour overhead and `horizon` the colour at eye level; the dome is a
   * gradient between them.
   */
  sky: number;
  horizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
};

export type TreeKind = "pine" | "oak" | "birch" | "palm" | "dead";

/** Temperate farmland — the original valley, and the default for any map. */
const TEMPERATE: Biome = {
  id: "temperate",
  land: { rolling: 34, hills: 46, hillPower: 2.2, detail: 3.2, valley: 18, scale: 1 },
  ground: { lush: 0x556e3a, grass: 0x6a8442, dry: 0x8f9455, dirt: 0x8b7350, rock: 0x6f6a60, high: 0x9aa08c, highAt: 34 },
  trees: { count: 1900, kinds: ["pine", "pine", "oak", "birch"], density: 1.25, minScale: 0.75, maxScale: 1.45 },
  rocks: { count: 240, minScale: 1.1, maxScale: 3.4 },
  clutter: { count: 700, bushChance: 0.75 },
  river: null,
  lake: null,
  coast: null,
  trenches: { lines: 0, depth: 2.6, width: 4 },
  emplacements: { bunkers: 0, hedgehogs: 0, craft: 0 },
  fields: 0,
  craters: { count: 0, minR: 6, maxR: 14, depth: 2.2 },
  sky: 0x5f9bd4, horizon: 0xdde6dd, fog: 0xb7cbd8, fogNear: 420, fogFar: 2300,
};

export const BIOMES: Record<string, Biome> = {
  temperate: TEMPERATE,

  /** Hedgerow country: broken ground, dense low cover, short sightlines. */
  bocage: {
    ...TEMPERATE,
    id: "bocage",
    land: { rolling: 26, hills: 22, hillPower: 2.6, detail: 4.6, valley: 10, scale: 1.5 },
    ground: { lush: 0x47632f, grass: 0x5c7a38, dry: 0x7d8a49, dirt: 0x7d6647, rock: 0x67635a, high: 0x8d9480, highAt: 40 },
    trees: { count: 3400, kinds: ["oak", "oak", "birch", "pine"], density: 1.7, minScale: 0.8, maxScale: 1.6 },
    clutter: { count: 1500, bushChance: 0.88 },
    fog: 0xb0c4cc, fogNear: 300, fogFar: 1500,
  },

  /** Open steppe: long sightlines, almost nothing to hide behind. */
  steppe: {
    ...TEMPERATE,
    id: "steppe",
    land: { rolling: 20, hills: 14, hillPower: 3.0, detail: 2.0, valley: 8, scale: 0.65 },
    ground: { lush: 0x6f7a41, grass: 0x8a8c4e, dry: 0xa39a5c, dirt: 0x9a8558, rock: 0x7d766a, high: 0xa8a894, highAt: 30 },
    trees: { count: 320, kinds: ["pine", "dead", "birch"], density: 0.5, minScale: 0.7, maxScale: 1.1 },
    rocks: { count: 380, minScale: 0.9, maxScale: 2.6 },
    clutter: { count: 900, bushChance: 0.6 },
    sky: 0x86b4d8, horizon: 0xe2e6d8, fog: 0xcbd6dc, fogNear: 700, fogFar: 3000,
  },

  /** Coastal: low, sandy, palms, and a bright sky over the water. */
  coast: {
    ...TEMPERATE,
    id: "coast",
    land: { rolling: 18, hills: 26, hillPower: 2.8, detail: 2.4, valley: 22, scale: 0.9 },
    ground: { lush: 0x5f7a44, grass: 0x7d8a4e, dry: 0xbdae7e, dirt: 0xc2b384, rock: 0x8a8478, high: 0xa9a795, highAt: 44 },
    trees: { count: 1100, kinds: ["palm", "palm", "pine", "oak"], density: 1.0, minScale: 0.8, maxScale: 1.5 },
    rocks: { count: 300, minScale: 1.0, maxScale: 3.0 },
    clutter: { count: 600, bushChance: 0.7 },
    sky: 0x59a3d8, horizon: 0xe6efe8, fog: 0xc6dde8, fogNear: 600, fogFar: 2800,
  },

  /** Desert: bare, pale, hot haze, and next to no vegetation. */
  desert: {
    ...TEMPERATE,
    id: "desert",
    land: { rolling: 30, hills: 34, hillPower: 2.4, detail: 3.6, valley: 12, scale: 0.8 },
    ground: { lush: 0x9a8a5a, grass: 0xb0a069, dry: 0xc9b884, dirt: 0xd0be8c, rock: 0x9a8f76, high: 0xd8cca6, highAt: 38 },
    trees: { count: 180, kinds: ["dead", "palm"], density: 0.35, minScale: 0.7, maxScale: 1.2 },
    rocks: { count: 620, minScale: 1.0, maxScale: 3.8 },
    clutter: { count: 400, bushChance: 0.45 },
    sky: 0xb8ae8a, horizon: 0xe8dfc0, fog: 0xdcd2b4, fogNear: 500, fogFar: 2600,
  },

  /** Winter: snow over frozen ground, bare trees, flat grey light. */
  winter: {
    ...TEMPERATE,
    id: "winter",
    land: { rolling: 32, hills: 40, hillPower: 2.2, detail: 3.0, valley: 16, scale: 1 },
    ground: { lush: 0xc9d2d6, grass: 0xd8dfe2, dry: 0xbfc6c4, dirt: 0x8f8a80, rock: 0x8a8f92, high: 0xeef2f4, highAt: 24 },
    trees: { count: 1400, kinds: ["pine", "pine", "dead"], density: 1.1, minScale: 0.8, maxScale: 1.5 },
    rocks: { count: 260, minScale: 1.0, maxScale: 3.0 },
    clutter: { count: 380, bushChance: 0.5 },
    sky: 0x9fb0c0, horizon: 0xe4eaee, fog: 0xd4dade, fogNear: 260, fogFar: 1600,
  },

  /**
   * Falcon's Pass: an alpine river valley. Green pasture between rock
   * shoulders, pine on the high ground, a fast blue river down the right with
   * a bridge on each road, and enough shell holes to show it has been fought
   * over.
   */
  alpine: {
    ...TEMPERATE,
    id: "alpine",
    land: { rolling: 30, hills: 62, hillPower: 1.9, detail: 3.4, valley: 26, scale: 0.85 },
    ground: { lush: 0x4f7034, grass: 0x66883c, dry: 0x8a8a52, dirt: 0x9b7d52, rock: 0x8c887e, high: 0xa6a496, highAt: 46 },
    trees: { count: 2100, kinds: ["pine", "pine", "pine", "oak"], density: 1.3, minScale: 0.8, maxScale: 1.6 },
    rocks: { count: 520, minScale: 1.4, maxScale: 5.2 },
    clutter: { count: 800, bushChance: 0.8 },
    river: { width: 17, depth: 5.5, level: -6, colour: 0x4f93c4 },
    craters: { count: 46, minR: 7, maxR: 15, depth: 2.4 },
    sky: 0x4f8fd4, horizon: 0xdae6e4, fog: 0xb4cede, fogNear: 460, fogFar: 2500,
  },

  /**
   * Frost-Hammer: the same country under snow, with the river run out to a
   * frozen inlet. Everything pale, the pines dark against it, and the haze
   * closed right in.
   */
  arctic: {
    ...TEMPERATE,
    id: "arctic",
    land: { rolling: 30, hills: 58, hillPower: 2.0, detail: 3.2, valley: 24, scale: 0.85 },
    ground: { lush: 0xdfe6ea, grass: 0xe8eef1, dry: 0xcdd6da, dirt: 0xa8a49c, rock: 0x9aa2a8, high: 0xf4f8fa, highAt: 20 },
    trees: { count: 1500, kinds: ["pine", "pine", "dead"], density: 1.15, minScale: 0.85, maxScale: 1.7 },
    rocks: { count: 460, minScale: 1.3, maxScale: 4.6 },
    clutter: { count: 420, bushChance: 0.35 },
    river: { width: 21, depth: 5.0, level: -6, colour: 0x7fb4d6 },
    craters: { count: 38, minR: 7, maxR: 14, depth: 2.0 },
    sky: 0x9cc2de, horizon: 0xeaf2f6, fog: 0xdae6ee, fogNear: 280, fogFar: 1700,
  },

  /**
   * Frost-Guard Peaks: churned mud under an overcast sky. Nothing green is
   * left standing — only dead trunks — and the ground is more shell hole than
   * field, with a sluggish flooded watercourse through the middle.
   */
  mud: {
    ...TEMPERATE,
    id: "mud",
    land: { rolling: 24, hills: 30, hillPower: 2.4, detail: 5.4, valley: 20, scale: 1.25 },
    ground: { lush: 0x50432f, grass: 0x5b4d38, dry: 0x6b5b43, dirt: 0x77654c, rock: 0x655d52, high: 0x6f6659, highAt: 34 },
    trees: { count: 420, kinds: ["dead", "dead", "dead", "pine"], density: 0.75, minScale: 0.7, maxScale: 1.3 },
    rocks: { count: 340, minScale: 0.9, maxScale: 2.8 },
    clutter: { count: 1100, bushChance: 0.25 },
    river: { width: 15, depth: 3.4, level: -7, colour: 0x5d6b63 },
    // The defining feature: the ground is more crater than field.
    craters: { count: 190, minR: 6, maxR: 18, depth: 3.0 },
    sky: 0x7b848c, horizon: 0xb4babd, fog: 0xa8b0b6, fogNear: 200, fogFar: 1300,
  },

  /**
   * Frost-Guard Trenches: the churned battlefield under snow. Same broken
   * ground and dead trunks as the mud map, but white, with the shell holes
   * showing as grey-blue scars rather than brown ones.
   */
  snow_trench: {
    ...TEMPERATE,
    id: "snow_trench",
    land: { rolling: 26, hills: 34, hillPower: 2.3, detail: 5.0, valley: 20, scale: 1.2 },
    ground: { lush: 0xd4dde3, grass: 0xdfe7ec, dry: 0xc4ced6, dirt: 0x9aa0a4, rock: 0x8f979d, high: 0xeff5f8, highAt: 26 },
    trees: { count: 520, kinds: ["dead", "dead", "dead", "pine"], density: 0.8, minScale: 0.7, maxScale: 1.4 },
    rocks: { count: 380, minScale: 1.0, maxScale: 3.4 },
    clutter: { count: 900, bushChance: 0.2 },
    river: { width: 15, depth: 3.6, level: -7, colour: 0x9cc4dc },
    lake: null,
    craters: { count: 200, minR: 6, maxR: 18, depth: 3.0 },
    sky: 0x8d9aa6, horizon: 0xd6dee4, fog: 0xcdd7dd, fogNear: 220, fogFar: 1500,
  },

  /**
   * Frost-Guard Summit: high alpine snow. Steep ground, heavy snow-laden pine
   * on the flanks and a frozen lake filling the eastern side of the valley.
   */
  alpine_snow: {
    ...TEMPERATE,
    id: "alpine_snow",
    land: { rolling: 34, hills: 78, hillPower: 1.8, detail: 3.6, valley: 22, scale: 0.8 },
    ground: { lush: 0xdae2e8, grass: 0xe6edf1, dry: 0xccd6dc, dirt: 0xa9a6a0, rock: 0x939ba2, high: 0xf6fafc, highAt: 30 },
    trees: { count: 2600, kinds: ["pine", "pine", "pine", "dead"], density: 1.45, minScale: 0.85, maxScale: 1.8 },
    rocks: { count: 560, minScale: 1.4, maxScale: 5.4 },
    clutter: { count: 500, bushChance: 0.3 },
    river: { width: 13, depth: 4.2, level: -6, colour: 0x86bbdc },
    // The frozen lake on the eastern flank.
    lake: { x: 168, z: 96, r: 120, depth: 9 },
    craters: { count: 30, minR: 7, maxR: 14, depth: 2.0 },
    sky: 0x6ea6d6, horizon: 0xe4eef4, fog: 0xd2e2ec, fogNear: 340, fogFar: 2100,
  },

  /**
   * Atlantic Wall: a Normandy shore. Sand and beach obstacles under the guns,
   * a bluff to climb, then hedgerowed farmland and a village on the plateau.
   */
  atlantic: {
    ...TEMPERATE,
    id: "atlantic",
    land: { rolling: 16, hills: 18, hillPower: 2.6, detail: 2.6, valley: 6, scale: 1.15 },
    ground: { lush: 0x4f7034, grass: 0x66883c, dry: 0xa89a58, dirt: 0x9b8358, rock: 0x8a8378, high: 0x9fa08c, highAt: 52 },
    trees: { count: 1500, kinds: ["oak", "oak", "pine", "birch"], density: 1.35, minScale: 0.8, maxScale: 1.5 },
    rocks: { count: 220, minScale: 0.9, maxScale: 2.6 },
    clutter: { count: 950, bushChance: 0.82 },
    // Width 0: the shore profile shapes the sea bed, so no channel is cut —
    // the plane is only here to give the water a surface.
    river: { width: 0, depth: 0, level: -1.0, colour: 0x2f86b4 },
    coast: { shoreX: -196, beach: 62, bluff: 46, rise: 30, sand: 0xd8c894, surf: 0x2f86b4 },
    trenches: { lines: 5, depth: 2.8, width: 4.2 },
    emplacements: { bunkers: 9, hedgehogs: 90, craft: 7 },
    fields: 1,
    craters: { count: 70, minR: 6, maxR: 14, depth: 2.2 },
    sky: 0x4f93d4, horizon: 0xdce8ea, fog: 0xc2d6de, fogNear: 520, fogFar: 2700,
  },

  /**
   * Fortress Island: the same shore harder. A gun battery on the headland, a
   * ruined town inland, and a shelled trench belt behind it.
   */
  island: {
    ...TEMPERATE,
    id: "island",
    land: { rolling: 22, hills: 40, hillPower: 2.2, detail: 3.2, valley: 8, scale: 0.95 },
    ground: { lush: 0x557437, grass: 0x6c8b40, dry: 0x9d9455, dirt: 0x94805a, rock: 0x86807a, high: 0x9a9a8a, highAt: 48 },
    trees: { count: 1300, kinds: ["pine", "pine", "oak", "dead"], density: 1.2, minScale: 0.85, maxScale: 1.7 },
    rocks: { count: 420, minScale: 1.2, maxScale: 4.4 },
    clutter: { count: 700, bushChance: 0.6 },
    // Width 0: the shore profile shapes the sea bed, so no channel is cut —
    // the plane is only here to give the water a surface.
    river: { width: 0, depth: 0, level: -1.0, colour: 0x2b7fae },
    coast: { shoreX: -190, beach: 54, bluff: 54, rise: 40, sand: 0xd4c48e, surf: 0x2b7fae },
    trenches: { lines: 6, depth: 3.0, width: 4.4 },
    emplacements: { bunkers: 11, hedgehogs: 74, craft: 6 },
    fields: 0,
    craters: { count: 130, minR: 6, maxR: 17, depth: 2.8 },
    sky: 0x4a8cc8, horizon: 0xd6e2e4, fog: 0xbdd0da, fogNear: 460, fogFar: 2500,
  },
};

export function biomeById(id: string): Biome {
  return BIOMES[id] ?? TEMPERATE;
}

export class Terrain {
  readonly seed: number;
  readonly biome: Biome;
  readonly craters: Crater[];
  readonly trenchLines: Trench[];
  /** Bridge decks, for rendering and for AI that needs to find a crossing. */
  readonly bridges: { x: number; z: number; yaw: number; span: number; deckY: number }[] = [];
  /** Structural props the renderer instances — currently just bridge decks. */
  readonly props: Prop[] = [];
  /** (GRID + 1)^2 heights, row-major in z. */
  readonly heights: Float32Array;
  readonly obstacles: Obstacle[] = [];
  readonly trees: TreeProp[] = [];
  readonly rocks: Prop[] = [];
  readonly clutter: Prop[] = [];

  constructor(seed: number, biome: Biome | string = TEMPERATE) {
    this.seed = seed;
    this.biome = typeof biome === "string" ? biomeById(biome) : biome;
    // Shell holes are cut into the landform, so they have to exist before a
    // single height is sampled.
    this.craters = this.placeCraters(mulberry32(seed ^ 0xc7a7e5));
    this.trenchLines = this.placeTrenches(mulberry32(seed ^ 0x3b19d1));
    const n = GRID + 1;
    this.heights = new Float32Array(n * n);
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const x = -MAP_HALF + gx * CELL;
        const z = -MAP_HALF + gz * CELL;
        this.heights[gz * n + gx] = this.shapedHeight(x, z);
      }
    }
    const rand = mulberry32(seed ^ 0x51f3);
    this.scatter(rand);
  }

  /**
   * Shell holes, kept clear of the roads and the bridges so the map stays
   * drivable. Craters near the capture line are denser, which is where the
   * shelling would have been.
   */
  private placeCraters(rand: Rand): Crater[] {
    const spec = this.biome.craters;
    const out: Crater[] = [];
    for (let i = 0; i < spec.count * 3 && out.length < spec.count; i++) {
      const x = range(rand, -MAP_HALF + 40, MAP_HALF - 40);
      const z = range(rand, -MAP_HALF + 40, MAP_HALF - 40);
      // Heavier towards the middle, where the two sides actually meet.
      if (rand() > 1 - Math.abs(z) / (MAP_HALF * 1.4)) continue;
      if (polylineDistance(x, z, ROAD_NODES) < 14) continue;
      if (polylineDistance(x, z, LATERAL_NODES) < 14) continue;
      if (this.biome.river && polylineDistance(x, z, RIVER_NODES) < this.biome.river.width + 8) continue;
      const lk = this.biome.lake;
      if (lk && Math.hypot(x - lk.x, z - lk.z) < lk.r * 1.2) continue;
      let tooClose = false;
      for (const b of BRIDGES) if (Math.hypot(x - b.x, z - b.z) < b.span) tooClose = true;
      for (const zone of ZONES) if (Math.hypot(x - zone.x, z - zone.z) < zone.radius * 0.7) tooClose = true;
      if (tooClose) continue;
      out.push({ x, z, r: range(rand, spec.minR, spec.maxR), depth: spec.depth * range(rand, 0.6, 1.3) });
    }
    return out;
  }

  /**
   * Trench belts, run roughly parallel to the shore on a coastal map or across
   * the middle of the map otherwise. Each is a zigzag, because a straight
   * trench gives enfilade fire down its whole length and nobody dug them that
   * way.
   */
  private placeTrenches(rand: Rand): Trench[] {
    const spec = this.biome.trenches;
    if (spec.lines === 0) return [];
    const out: Trench[] = [];
    const coast = this.biome.coast;
    for (let i = 0; i < spec.lines; i++) {
      const nodes: { x: number; z: number }[] = [];
      // Coastal belts sit just inland of the bluff top and run north-south.
      const baseX = coast
        ? coast.shoreX + coast.beach + coast.bluff + range(rand, 30, 210)
        : range(rand, -MAP_HALF * 0.6, MAP_HALF * 0.6);
      const z0 = range(rand, -MAP_HALF * 0.8, -MAP_HALF * 0.1);
      const length = range(rand, 180, 400);
      const steps = Math.max(6, Math.round(length / 26));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        // The zigzag: alternate the traverse either side of the run.
        const zig = (k % 2 === 0 ? 1 : -1) * range(rand, 9, 17);
        nodes.push({
          x: baseX + zig + Math.sin(t * 2.4) * range(rand, 6, 22),
          z: z0 + t * length,
        });
      }
      out.push({ nodes });
    }
    return out;
  }

  /** How far a point is from the nearest trench, or Infinity if there are none. */
  trenchDistance(x: number, z: number) {
    let best = Infinity;
    for (const t of this.trenchLines) {
      const d = polylineDistance(x, z, t.nodes);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * The coastal profile at a point: sea, beach, or the bluff climbing inland.
   * Returns the height the shore imposes, and how strongly it applies.
   */
  private shoreProfile(x: number): { h: number; w: number } | null {
    const c = this.biome.coast;
    if (!c) return null;
    const inland = x - c.shoreX;
    if (inland > c.beach + c.bluff + 40) return null;
    if (inland < 0) {
      // Sea bed, shelving away from the beach.
      return { h: -6 - Math.min(26, -inland * 0.14), w: 1 };
    }
    if (inland < c.beach) {
      // Sand, rising very gently to the foot of the bluff.
      return { h: -1.5 + (inland / c.beach) * 4.5, w: 1 };
    }
    // The bluff, then blending into the landform on the plateau.
    const t = Math.min(1, (inland - c.beach) / c.bluff);
    const eased = t * t * (3 - 2 * t);
    const top = 3 + c.rise;
    const past = Math.max(0, inland - c.beach - c.bluff);
    return { h: 3 + eased * c.rise, w: 1 - smoothstep(0, 40, past) * 0.55, ...(top ? {} : {}) };
  }

  /** How far a point is from the middle of the river, or Infinity on dry maps. */
  riverDistance(x: number, z: number) {
    if (!this.biome.river) return Infinity;
    return polylineDistance(x, z, RIVER_NODES);
  }

  /** True where the ground is below the waterline — vehicles should avoid it. */
  inWater(x: number, z: number) {
    const c = this.biome.coast;
    // Everything seaward of the waterline is water, whatever else is going on.
    if (c && x < c.shoreX + 2) return true;
    const r = this.biome.river;
    if (!r) return false;
    const lk = this.biome.lake;
    const inLake = lk !== null && Math.hypot(x - lk.x, z - lk.z) < lk.r;
    if (!inLake && this.riverDistance(x, z) > r.width * 1.2) return false;
    // A bridge deck is not water, whatever the ground under it is doing.
    for (const b of BRIDGES) if (Math.hypot(x - b.x, z - b.z) < b.span * 0.5) return false;
    return this.heightAt(x, z) < r.level + 0.4;
  }

  /** Raw landform before roads and clearings are cut into it. */
  private rawHeight(x: number, z: number) {
    const s = this.seed;
    const L = this.biome.land;
    // The horizontal scale multiplier stretches or compresses the whole
    // landform: below 1 gives broad open sweeps, above 1 breaks it up.
    const k = L.scale;
    const rolling = (fbm(s, x * 0.0045 * k, z * 0.0045 * k, 4) - 0.5) * L.rolling;
    const hills = Math.pow(ridge(s + 91, x * 0.0021 * k, z * 0.0021 * k, 3), L.hillPower) * L.hills;
    const detail = (fbm(s + 311, x * 0.02, z * 0.02, 3) - 0.5) * L.detail;
    // The middle of the map is a shallow valley, so the capture line is
    // overlooked from both flanks rather than being a flat plate.
    const valley = -L.valley * Math.exp(-((z + 10) * (z + 10)) / (150 * 150));
    // Ridge the map off at the edges so nothing drives out of the world.
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const wall = smoothstep(MAP_HALF - 70, MAP_HALF - 6, edge) * 60;
    return rolling + hills + detail + valley + wall;
  }

  /** Landform with roads graded flat and the villages levelled. */
  private shapedHeight(x: number, z: number) {
    let h = this.rawHeight(x, z);

    // The river channel: pull the ground down to the bed inside the banks, and
    // ease back up to the landform over a bank width either side.
    const river = this.biome.river;
    if (river) {
      const d = polylineDistance(x, z, RIVER_NODES);
      const bank = river.width * 2.1;
      if (d < bank) {
        const bed = river.level - river.depth;
        // Flat bed in the middle, sloping banks outside it.
        const t = smoothstep(river.width * 0.55, bank, d);
        h = lerp(Math.min(h, bed), h, t);
      }
    }

    // The shore overrides the landform entirely at the water's edge, and
    // releases its grip as the ground climbs onto the plateau.
    const shore = this.shoreProfile(x);
    if (shore) h = lerp(h, shore.h, shore.w);

    // A lake is the same idea as the river channel: a bowl down to the bed,
    // easing back up to the landform around the shoreline.
    const lake = this.biome.lake;
    if (lake && river) {
      const d = Math.hypot(x - lake.x, z - lake.z);
      if (d < lake.r * 1.35) {
        const bed = river.level - lake.depth;
        h = lerp(Math.min(h, bed), h, smoothstep(lake.r * 0.72, lake.r * 1.35, d));
      }
    }

    // Trenches: cut a flat-bottomed channel, with the spoil heaped on the
    // seaward lip so it reads as a parapet rather than a ditch.
    if (this.trenchLines.length > 0) {
      const d = this.trenchDistance(x, z);
      const spec = this.biome.trenches;
      if (d < spec.width * 2.6) {
        if (d < spec.width) {
          h -= spec.depth * (1 - smoothstep(spec.width * 0.55, spec.width, d));
        } else {
          const t = (d - spec.width) / (spec.width * 1.6);
          h += spec.depth * 0.42 * (1 - t) * (1 - t);
        }
      }
    }

    // Shell holes: a bowl with a raised lip, cut after the river so a crater
    // on the bank does not flood.
    for (const c of this.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r * 1.45) continue;
      if (d < c.r) {
        // Bowl, deepest at the centre.
        const t = d / c.r;
        h -= c.depth * (1 - t * t);
      } else {
        // Spoil thrown up around the rim.
        const t = (d - c.r) / (c.r * 0.45);
        h += c.depth * 0.28 * (1 - t) * (1 - t);
      }
    }

    // Roads: pull the ground towards the height at the nearest road centre.
    // On a river map the deck height is held above the water so the approaches
    // to a bridge rise to meet it instead of running into the channel.
    for (const nodes of [ROAD_NODES, LATERAL_NODES]) {
      const d = polylineDistance(x, z, nodes);
      if (d < 26) {
        const w = 1 - smoothstep(7, 26, d);
        let target = this.roadHeight(x, z, nodes);
        if (river) {
          for (const b of BRIDGES) {
            const db = Math.hypot(x - b.x, z - b.z);
            if (db < b.span) {
              const t = 1 - smoothstep(b.span * 0.35, b.span, db);
              target = lerp(target, river.level + 2.6, t);
            }
          }
        }
        h = lerp(h, target, w * 0.9);
      }
    }

    // Villages and bases sit on levelled ground.
    for (const zone of ZONES) {
      const d = Math.hypot(x - zone.x, z - zone.z);
      const w = 1 - smoothstep(zone.radius * 0.5, zone.radius * 1.5, d);
      if (w > 0) h = lerp(h, this.rawHeight(zone.x, zone.z), w * 0.88);
    }
    for (const team of ["blue", "red"] as Team[]) {
      const b = BASES[team];
      const d = Math.hypot(x - b.x, z - b.z);
      const w = 1 - smoothstep(30, 90, d);
      if (w > 0) h = lerp(h, this.rawHeight(b.x, b.z), w * 0.95);
      const a = AIRFIELDS[team];
      const da = Math.hypot(x - a.x, z - a.z);
      const wa = 1 - smoothstep(24, 70, da);
      if (wa > 0) h = lerp(h, this.rawHeight(a.x, a.z), wa * 0.98);
    }

    // Inland ground is held above the waterline. The sea plane spans the whole
    // map, so anything below sea level anywhere shows as water — without this
    // a levelled village sitting in a dip appears flooded to the rooftops.
    const shoreline = this.biome.coast;
    if (shoreline && this.biome.river) {
      const inland = x - shoreline.shoreX;
      if (inland > 4) {
        const floor = this.biome.river.level + 0.6;
        h = Math.max(h, lerp(this.biome.river.level - 1, floor, smoothstep(4, 16, inland)));
      }
    }

    return h;
  }

  /** Height of the road surface itself: the raw ground, smoothed along the run. */
  private roadHeight(x: number, z: number, nodes: { x: number; z: number }[]) {
    let bestD = Infinity;
    let bx = x;
    let bz = z;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < bestD) {
        bestD = d;
        bx = cx;
        bz = cz;
      }
    }
    // Average the raw height either side of the centreline so the grade is smooth.
    let sum = 0;
    for (let i = -2; i <= 2; i++) sum += this.rawHeight(bx + i * 9, bz + i * 9);
    return sum / 5;
  }

  /** How road-like a point is, 0..1. Drives both the vertex colour and AI pathing. */
  roadiness(x: number, z: number) {
    const a = 1 - smoothstep(5, 13, polylineDistance(x, z, ROAD_NODES));
    const b = 1 - smoothstep(5, 12, polylineDistance(x, z, LATERAL_NODES));
    return Math.max(a, b);
  }

  /** Bilinear ground height. Points outside the map clamp to the edge. */
  heightAt(x: number, z: number) {
    const n = GRID + 1;
    const fx = clamp((x + MAP_HALF) / CELL, 0, GRID - 0.0001);
    const fz = clamp((z + MAP_HALF) / CELL, 0, GRID - 0.0001);
    const gx = Math.floor(fx);
    const gz = Math.floor(fz);
    const tx = fx - gx;
    const tz = fz - gz;
    const h00 = this.heights[gz * n + gx];
    const h10 = this.heights[gz * n + gx + 1];
    const h01 = this.heights[(gz + 1) * n + gx];
    const h11 = this.heights[(gz + 1) * n + gx + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = CELL * 0.6;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  /** Steepness in radians, used to keep vehicles off cliffs. */
  slopeAt(x: number, z: number) {
    const n = this.normalAt(x, z, _tmpNormal);
    return Math.acos(clamp(n.y, -1, 1));
  }

  /* ---------------- props ---------------- */

  private scatter(rand: Rand) {
    for (const zone of ZONES) this.village(rand, zone);
    for (const team of ["blue", "red"] as Team[]) this.depot(rand, team);
    // Only where a channel was actually cut. A coastal map declares a river
    // purely to get a water surface for the sea, and bridging that would put
    // two spans across dry farmland.
    if (this.biome.river && this.biome.river.width > 0) for (const b of BRIDGES) this.bridge(b);
    this.defences(rand);

    // Woodland, thickest on the flanks where the capture line is not.
    const treeKinds = this.biome.trees.kinds;
    for (let i = 0; i < this.biome.trees.count; i++) {
      const x = range(rand, -MAP_HALF + 12, MAP_HALF - 12);
      const z = range(rand, -MAP_HALF + 12, MAP_HALF - 12);
      const y = this.heightAt(x, z);
      if (this.slopeAt(x, z) > 0.62) continue;
      if (this.roadiness(x, z) > 0.25) continue;
      if (this.inWater(x, z)) continue;
      if (this.nearFeature(x, z, 0.85)) continue;
      const density = fbm(this.seed + 77, x * 0.006, z * 0.006, 3);
      if (rand() > density * this.biome.trees.density) continue;
      if (this.obstructed(x, z, 3)) continue;
      this.trees.push({
        x,
        y,
        z,
        rot: rand() * Math.PI * 2,
        scale: range(rand, this.biome.trees.minScale, this.biome.trees.maxScale),
        kind: pick(rand, treeKinds),
        fall: 0,
        fallDir: rand() * Math.PI * 2,
        falling: false,
      });
    }

    for (let i = 0; i < this.biome.rocks.count; i++) {
      const x = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      const z = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      if (this.roadiness(x, z) > 0.3) continue;
      if (this.inWater(x, z)) continue;
      const steep = this.slopeAt(x, z);
      if (steep < 0.2 && rand() < 0.6) continue;
      const scale = range(rand, this.biome.rocks.minScale, this.biome.rocks.maxScale);
      const y = this.heightAt(x, z);
      this.rocks.push({ x, y, z, rot: rand() * Math.PI * 2, scale, kind: "rock" });
      if (scale > 2.1) {
        this.obstacles.push(box(x, y + scale * 0.6, z, scale * 0.9, scale * 0.7, scale * 0.9, 0, true));
      }
    }

    // Bushes and fence posts: cover that reads at a distance.
    for (let i = 0; i < this.biome.clutter.count; i++) {
      const x = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      const z = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      if (this.slopeAt(x, z) > 0.55) continue;
      if (this.inWater(x, z)) continue;
      this.clutter.push({
        x,
        y: this.heightAt(x, z),
        z,
        rot: rand() * Math.PI * 2,
        scale: range(rand, 0.7, 1.5),
        kind: rand() < this.biome.clutter.bushChance ? "bush" : "stump",
      });
    }
  }

  private nearFeature(x: number, z: number, mul: number) {
    for (const zone of ZONES) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius * mul) return true;
    }
    for (const team of ["blue", "red"] as Team[]) {
      const b = BASES[team];
      if (Math.hypot(x - b.x, z - b.z) < 70) return true;
      const a = AIRFIELDS[team];
      if (Math.hypot(x - a.x, z - a.z) < 60) return true;
    }
    return false;
  }

  private obstructed(x: number, z: number, pad: number) {
    for (const o of this.obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.radius + pad) return true;
    }
    return false;
  }

  /** A cluster of buildings, walls and sandbags on a capture point. */
  private village(rand: Rand, zone: Zone) {
    const count = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.7;
      const dist = range(rand, 8, zone.radius * 0.82);
      const x = zone.x + Math.cos(ang) * dist;
      const z = zone.z + Math.sin(ang) * dist;
      if (this.obstructed(x, z, 6)) continue;
      const w = range(rand, 5, 9);
      const d = range(rand, 5, 9);
      const h = rand() < 0.35 ? range(rand, 6.5, 9) : range(rand, 3.6, 5);
      const rot = Math.round(rand() * 4) * (Math.PI / 2) + range(rand, -0.25, 0.25);
      const y = this.heightAt(x, z);
      this.obstacles.push(box(x, y + h / 2, z, w / 2, h / 2, d / 2, rot, true));
      this.clutter.push({ x, y, z, rot, scale: 1, kind: `house:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}` });
    }
    // Sandbag rings give infantry something to fight from.
    const bagRings = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < bagRings; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = range(rand, zone.radius * 0.35, zone.radius * 0.8);
      const x = zone.x + Math.cos(ang) * dist;
      const z = zone.z + Math.sin(ang) * dist;
      if (this.obstructed(x, z, 5)) continue;
      const rot = rand() * Math.PI * 2;
      const y = this.heightAt(x, z);
      this.obstacles.push(box(x, y + 0.55, z, 3.2, 0.55, 0.7, rot, false));
      this.clutter.push({ x, y, z, rot, scale: 1, kind: "sandbags" });
    }
    this.clutter.push({ x: zone.x, y: this.heightAt(zone.x, zone.z), z: zone.z, rot: 0, scale: 1, kind: `flag:${zone.id}` });
  }

  /** Spawn depot: a couple of huts, a fuel dump and the flagpole. */
  /**
   * A bridge deck with parapets. The deck is a prop rather than terrain, so
   * shells and wheels both meet it at the right height; the parapets are solid
   * so nothing drives off the side into the river.
   */
  private bridge(b: { x: number; z: number; yaw: number; span: number }) {
    const river = this.biome.river;
    if (!river) return;
    const deckY = river.level + 2.6;
    const halfSpan = b.span * 0.5;
    const halfWide = 7;
    this.props.push({ x: b.x, y: deckY, z: b.z, rot: b.yaw, scale: 1, kind: "bridge" });
    // The deck itself: walkable, and solid to shellfire from the side.
    this.obstacles.push(box(b.x, deckY - 0.6, b.z, halfSpan, 0.6, halfWide, b.yaw, false));
    // Parapets down both edges.
    for (const side of [-1, 1]) {
      const px = b.x + Math.cos(b.yaw) * 0 - Math.sin(b.yaw) * 0;
      const ox = -Math.sin(b.yaw + Math.PI / 2) * side * halfWide;
      const oz = -Math.cos(b.yaw + Math.PI / 2) * side * halfWide;
      this.obstacles.push(box(px + ox, deckY + 0.6, b.z + oz, halfSpan, 0.6, 0.5, b.yaw, true));
    }
    this.bridges.push({ x: b.x, z: b.z, yaw: b.yaw, span: b.span, deckY });
  }

  /**
   * Beach defences: casemates spaced along the top of the bluff looking down
   * the sand, hedgehogs strewn across the tideline, and landing craft run
   * aground in the shallows.
   */
  private defences(rand: Rand) {
    const c = this.biome.coast;
    const spec = this.biome.emplacements;
    if (!c) return;

    // Casemates, set back on the bluff shoulder so they command the beach.
    for (let i = 0; i < spec.bunkers; i++) {
      const z = range(rand, -MAP_HALF + 50, MAP_HALF - 50);
      const x = c.shoreX + c.beach + range(rand, -6, c.bluff * 0.8);
      const y = this.heightAt(x, z);
      if (this.obstructed(x, z, 16)) continue;
      // Facing the water, which is -X.
      this.props.push({ x, y, z, rot: -Math.PI / 2, scale: 1, kind: "bunker" });
      this.obstacles.push(box(x, y + 2.2, z, 5.6, 2.4, 4.6, -Math.PI / 2, true));
    }

    // Hedgehogs, thickest right on the waterline.
    for (let i = 0; i < spec.hedgehogs; i++) {
      const z = range(rand, -MAP_HALF + 20, MAP_HALF - 20);
      const x = c.shoreX + range(rand, -16, c.beach * 0.75);
      const y = this.heightAt(x, z);
      this.clutter.push({ x, y, z, rot: rand() * Math.PI * 2, scale: range(rand, 0.9, 1.3), kind: "hedgehog" });
    }

    // Landing craft, bows to the beach.
    for (let i = 0; i < spec.craft; i++) {
      const z = range(rand, -MAP_HALF + 60, MAP_HALF - 60);
      const x = c.shoreX - range(rand, 6, 58);
      const y = (this.biome.river?.level ?? 0) - 0.6;
      this.props.push({ x, y, z, rot: Math.PI / 2 + range(rand, -0.35, 0.35), scale: 1, kind: "craft" });
    }
  }

  private depot(rand: Rand, team: Team) {
    const b = BASES[team];
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const x = b.x + Math.cos(ang) * range(rand, 22, 34);
      const z = b.z + Math.sin(ang) * range(rand, 22, 34);
      const y = this.heightAt(x, z);
      const w = range(rand, 6, 8);
      const d = range(rand, 8, 12);
      const h = 4.4;
      const rot = ang + Math.PI / 2;
      this.obstacles.push(box(x, y + h / 2, z, w / 2, h / 2, d / 2, rot, true));
      this.clutter.push({ x, y, z, rot, scale: 1, kind: `house:${w.toFixed(2)}:${d.toFixed(2)}:${h.toFixed(2)}` });
    }
    for (let i = 0; i < 8; i++) {
      const x = b.x + range(rand, -40, 40);
      const z = b.z + range(rand, -40, 40);
      this.clutter.push({ x, y: this.heightAt(x, z), z, rot: rand() * Math.PI * 2, scale: 1, kind: "crate" });
    }
  }

  /* ---------------- queries ---------------- */

  /** Does a point sit inside any obstacle? `pad` inflates the box. */
  inObstacle(x: number, y: number, z: number, pad = 0, vehicle = false) {
    for (const o of this.obstacles) {
      if (vehicle && !o.solidToVehicles) continue;
      if (Math.abs(y - o.y) > o.hh + pad) continue;
      const dx = x - o.x;
      const dz = z - o.z;
      if (dx * dx + dz * dz > (o.radius + pad) * (o.radius + pad)) continue;
      const c = Math.cos(-o.rot);
      const s = Math.sin(-o.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= o.hw + pad && Math.abs(lz) <= o.hd + pad) return o;
    }
    return null;
  }

  /** Nearest obstacle hit along a ray, or null. Distances are in world units. */
  rayObstacle(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    let best: { t: number; obstacle: Obstacle; normal: THREE.Vector3 } | null = null;
    for (const o of this.obstacles) {
      const hit = rayBox(origin, dir, o.x, o.y, o.z, o.hw, o.hh, o.hd, o.rot, maxDist);
      if (hit && (!best || hit.t < best.t)) best = { t: hit.t, obstacle: o, normal: hit.normal };
    }
    return best;
  }

  /**
   * Does the ground or a building sit between two points? Sampled rather than
   * marched exactly: cheap enough to run for every AI contact every few frames.
   */
  losBlocked(from: THREE.Vector3, to: THREE.Vector3) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.5) return false;
    const steps = Math.min(48, Math.max(4, Math.ceil(dist / 6)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const z = from.z + dz * t;
      if (this.heightAt(x, z) > y + 0.35) return true;
      if (this.inObstacle(x, y, z, 0)) return true;
    }
    return false;
  }

  /* ---------------- mesh ---------------- */

  /** Flat-shaded ground. One triangle pair per cell, coloured by slope and use. */
  buildMesh() {
    const n = GRID + 1;
    const quads = GRID * GRID;
    const positions = new Float32Array(quads * 6 * 3);
    const colors = new Float32Array(quads * 6 * 3);
    const normal = new THREE.Vector3();
    const color = new THREE.Color();
    const rand = mulberry32(this.seed ^ 0x2ee1);
    let p = 0;

    const cornerHeight = (gx: number, gz: number) => this.heights[gz * n + gx];

    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const x0 = -MAP_HALF + gx * CELL;
        const z0 = -MAP_HALF + gz * CELL;
        const x1 = x0 + CELL;
        const z1 = z0 + CELL;
        const h00 = cornerHeight(gx, gz);
        const h10 = cornerHeight(gx + 1, gz);
        const h01 = cornerHeight(gx, gz + 1);
        const h11 = cornerHeight(gx + 1, gz + 1);
        const tris = [
          [x0, h00, z0, x0, h01, z1, x1, h10, z0],
          [x1, h10, z0, x0, h01, z1, x1, h11, z1],
        ];
        for (const t of tris) {
          const cx = (t[0] + t[3] + t[6]) / 3;
          const cz = (t[2] + t[5] + t[8]) / 3;
          const cy = (t[1] + t[4] + t[7]) / 3;
          normal.set(t[3] - t[0], t[4] - t[1], t[5] - t[2]);
          const bx = t[6] - t[0];
          const by = t[7] - t[1];
          const bz = t[8] - t[2];
          normal.cross(_tmpNormal.set(bx, by, bz)).normalize();
          const slope = 1 - Math.abs(normal.y);
          this.paintGround(color, cx, cy, cz, slope, rand);
          for (let v = 0; v < 3; v++) {
            positions[p] = t[v * 3];
            positions[p + 1] = t[v * 3 + 1];
            positions[p + 2] = t[v * 3 + 2];
            colors[p] = color.r;
            colors[p + 1] = color.g;
            colors[p + 2] = color.b;
            p += 3;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private paintGround(out: THREE.Color, x: number, y: number, z: number, slope: number, rand: Rand) {
    const road = this.roadiness(x, z);
    const g = this.biome.ground;
    const dry = fbm(this.seed + 55, x * 0.008, z * 0.008, 3);

    // Sand runs from the waterline to the foot of the bluff, and a little way
    // up it, so the transition is not a hard line.
    const c = this.biome.coast;
    if (c) {
      const inland = x - c.shoreX;
      if (inland < c.beach + 14) {
        out.setHex(c.sand);
        const j0 = 0.94 + rand() * 0.12;
        out.multiplyScalar(j0);
        return;
      }
    }

    // Patchwork farmland: big low-frequency cells, each taking either pasture
    // or standing crop, which is what makes the plateau read as fields.
    if (this.biome.fields > 0 && slope < 0.3 && road < 0.4) {
      const cell = fbm(this.seed + 909, x * 0.0042, z * 0.0042, 2);
      if (cell > 0.58) {
        out.setHex(g.dry);
        out.multiplyScalar(0.92 + rand() * 0.16);
        return;
      }
      if (cell < 0.42) {
        out.setHex(g.lush);
        out.multiplyScalar(0.92 + rand() * 0.16);
        return;
      }
    }
    if (slope > 0.55) {
      out.setHex(g.rock);
    } else if (road > 0.45) {
      out.setHex(g.dirt);
    } else if (slope > 0.34) {
      out.setHex(g.dry);
    } else if (dry > 0.62) {
      out.setHex(g.dry);
    } else if (dry < 0.38) {
      out.setHex(g.lush);
    } else {
      out.setHex(g.grass);
    }
    // Let the crests go pale so elevation reads even on flat-lit ground.
    if (y > g.highAt) out.lerp(_tmpColor.setHex(g.high), smoothstep(g.highAt, g.highAt + 28, y) * 0.6);
    const j = 0.92 + rand() * 0.16;
    out.multiplyScalar(j);
  }
}

const _tmpNormal = new THREE.Vector3();
const _tmpColor = new THREE.Color();

function box(
  x: number,
  y: number,
  z: number,
  hw: number,
  hh: number,
  hd: number,
  rot: number,
  solidToVehicles: boolean,
): Obstacle {
  return { x, y, z, hw, hh, hd, rot, radius: Math.hypot(hw, hd), solidToVehicles };
}

const _local = new THREE.Vector3();
const _localDir = new THREE.Vector3();

/**
 * Slab test against a box rotated about Y. Returns the entry distance and the
 * world-space normal of the face that was struck, which is what the armour
 * model needs to work out an impact angle.
 */
export function rayBox(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  cx: number,
  cy: number,
  cz: number,
  hw: number,
  hh: number,
  hd: number,
  rot: number,
  maxDist: number,
): { t: number; normal: THREE.Vector3; face: "x" | "y" | "z"; local: THREE.Vector3 } | null {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const dx = origin.x - cx;
  const dz = origin.z - cz;
  _local.set(dx * c - dz * s, origin.y - cy, dx * s + dz * c);
  _localDir.set(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c);

  let tmin = 0;
  let tmax = maxDist;
  let axis: "x" | "y" | "z" = "x";
  let sign = 1;
  const half = [hw, hh, hd];
  const names: ("x" | "y" | "z")[] = ["x", "y", "z"];
  const o = [_local.x, _local.y, _local.z];
  const d = [_localDir.x, _localDir.y, _localDir.z];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-6) {
      if (Math.abs(o[i]) > half[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (-half[i] - o[i]) * inv;
    let t2 = (half[i] - o[i]) * inv;
    let s1 = -1;
    if (t1 > t2) {
      const tt = t1;
      t1 = t2;
      t2 = tt;
      s1 = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = names[i];
      sign = s1;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || tmin > maxDist) return null;

  // Rotate the local face normal back into world space.
  const nl = new THREE.Vector3(
    axis === "x" ? sign : 0,
    axis === "y" ? sign : 0,
    axis === "z" ? sign : 0,
  );
  const cc = Math.cos(rot);
  const ss = Math.sin(rot);
  const normal = new THREE.Vector3(nl.x * cc - nl.z * ss, nl.y, nl.x * ss + nl.z * cc);
  const local = new THREE.Vector3(
    _local.x + _localDir.x * tmin,
    _local.y + _localDir.y * tmin,
    _local.z + _localDir.z * tmin,
  );
  return { t: tmin, normal, face: axis, local };
}
