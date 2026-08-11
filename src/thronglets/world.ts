import * as THREE from "three";
import { mulberry32, range, type Rand } from "./random";

export const WORLD_RADIUS = 72;
export const WATER_LEVEL = -0.22;

export type Pond = { x: number; z: number; r: number };

export type TreeKind = "apple" | "oak" | "pine" | "palm";

/** What each kind is worth to a colony. */
export const TREE_TRAITS: Record<
  TreeKind,
  { wood: number; fruit: number; regrow: number; scale: [number, number] }
> = {
  apple: { wood: 55, fruit: 6, regrow: 26, scale: [0.82, 1.25] },
  oak: { wood: 130, fruit: 0, regrow: 0, scale: [0.85, 1.2] },
  pine: { wood: 90, fruit: 0, regrow: 0, scale: [0.8, 1.3] },
  palm: { wood: 35, fruit: 3, regrow: 40, scale: [0.9, 1.25] },
};

export type Rock = {
  id: number;
  x: number;
  z: number;
  y: number;
  scale: number;
  rot: number;
  /** Stone left in the boulder. Quarrying does not grow back quickly. */
  stone: number;
  capacity: number;
};

export type Tree = {
  id: number;
  kind: TreeKind;
  x: number;
  z: number;
  y: number;
  scale: number;
  rot: number;
  /** Ripe apples currently hanging. */
  fruit: number;
  capacity: number;
  regrow: number;
  /** Wood left before the tree is spent. */
  wood: number;
  fruitSlots: { x: number; y: number; z: number }[];
};

export type Bush = {
  id: number;
  x: number;
  z: number;
  y: number;
  scale: number;
  berries: number;
  regrow: number;
};

export type Tub = { x: number; z: number; y: number; rot: number };

export type Terrain = {
  height(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  ponds: Pond[];
  mesh: THREE.Mesh;
  water: THREE.Mesh;
};

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

function makeNoise(seed: number) {
  const rand = mulberry32(seed);
  const perm = new Float32Array(256 * 256);
  for (let i = 0; i < perm.length; i++) perm[i] = rand();

  const at = (xi: number, zi: number) =>
    perm[(((xi & 255) << 8) | (zi & 255)) >>> 0];

  const smooth = (t: number) => t * t * (3 - 2 * t);

  return function noise(x: number, z: number) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = smooth(x - xi);
    const zf = smooth(z - zi);
    const a = at(xi, zi);
    const b = at(xi + 1, zi);
    const c = at(xi, zi + 1);
    const d = at(xi + 1, zi + 1);
    return (
      a * (1 - xf) * (1 - zf) +
      b * xf * (1 - zf) +
      c * (1 - xf) * zf +
      d * xf * zf
    );
  };
}

export function buildTerrain(seed: number, ponds: Pond[]): Terrain {
  const noise = makeNoise(seed);

  const baseHeight = (x: number, z: number) => {
    let h =
      noise(x * 0.045, z * 0.045) * 2.4 +
      noise(x * 0.11, z * 0.11) * 0.7 +
      noise(x * 0.28, z * 0.28) * 0.18;
    h -= 1.55;

    // A broad central rise, so every seed produces a habitable island rather
    // than an archipelago the colony can drown in.
    const d = Math.hypot(x, z) / WORLD_RADIUS;
    h += Math.pow(Math.max(0, 1 - d * 1.35), 1.5) * 1.15;

    // Fall away to the sea at the island's edge.
    if (d > 0.82) h -= (d - 0.82) * 26;

    return h;
  };

  const height = (x: number, z: number) => {
    let h = baseHeight(x, z);
    for (const p of ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) {
        // Smooth bowl dug into the ground.
        const t = 1 - d / p.r;
        h -= t * t * (0.85 + p.r * 0.06);
      }
    }
    return h;
  };

  const isWater = (x: number, z: number) => height(x, z) < WATER_LEVEL;

  // --- mesh -------------------------------------------------------
  const SEG = 224;
  const SPAN = WORLD_RADIUS * 2.4;
  const geo = new THREE.PlaneGeometry(SPAN, SPAN, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const grass = new THREE.Color(0x4e9a3a).convertSRGBToLinear();
  const grassDark = new THREE.Color(0x357a2c).convertSRGBToLinear();
  const grassLight = new THREE.Color(0x76b94a).convertSRGBToLinear();
  const sand = new THREE.Color(0xd9c489).convertSRGBToLinear();
  const mud = new THREE.Color(0x6b5a3a).convertSRGBToLinear();
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);

    // Blend a few grass tones with a bit of noise, then shorelines.
    const t = noise(x * 0.35 + 11, z * 0.35 - 7);
    c.copy(grass).lerp(t > 0.55 ? grassLight : grassDark, Math.abs(t - 0.5));
    if (h < WATER_LEVEL + 0.55) {
      const k = THREE.MathUtils.clamp(
        (WATER_LEVEL + 0.55 - h) / 0.75,
        0,
        1,
      );
      c.lerp(sand, k * 0.85);
      if (h < WATER_LEVEL - 0.4) c.lerp(mud, 0.5);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  mesh.receiveShadow = true;
  mesh.name = "terrain";

  // --- water ------------------------------------------------------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN * 1.6, SPAN * 1.6, 1, 1),
    new THREE.MeshLambertMaterial({
      color: 0x2f8fc4,
      transparent: true,
      opacity: 0.78,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.name = "water";

  return { height, isWater, ponds, mesh, water };
}

/* ------------------------------------------------------------------ */
/* Flora + props                                                       */
/* ------------------------------------------------------------------ */

export function scatterPonds(rand: Rand): Pond[] {
  const ponds: Pond[] = [];
  const count = 15 + Math.floor(rand() * 7);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = range(rand, 8, WORLD_RADIUS * 0.66);
    ponds.push({
      x: Math.cos(a) * d,
      z: Math.sin(a) * d,
      r: range(rand, 3.4, 7.4),
    });
  }
  return ponds;
}

/**
 * Where a tree of each kind belongs. Palms hug the shore, pines take the high
 * ground, oaks fill the deep inland, apples grow anywhere temperate — so the
 * island reads as having places rather than one uniform forest.
 */
function treeKindFor(rand: Rand, y: number, distanceFromCentre: number): TreeKind {
  // Judge position by how far out it is rather than by absolute height: the
  // island's inland plateau sits low enough that a height rule put palms
  // everywhere and pines nowhere.
  const out = distanceFromCentre / WORLD_RADIUS;
  if (out > 0.74 && rand() < 0.75) return "palm";
  if (y > 1.35 && rand() < 0.65) return "pine";
  if (out < 0.58 && rand() < 0.45) return "oak";
  const roll = rand();
  if (roll < 0.6) return "apple";
  if (roll < 0.82) return "oak";
  return "pine";
}

export function scatterTrees(rand: Rand, terrain: Terrain): Tree[] {
  const trees: Tree[] = [];
  let id = 0;
  for (let i = 0; i < 26000 && trees.length < 620; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * WORLD_RADIUS * 0.92;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = terrain.height(x, z);
    if (y < WATER_LEVEL + 0.35) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.9)) continue;

    const kind = treeKindFor(rand, y, d);
    const traits = TREE_TRAITS[kind];
    const scale = range(rand, traits.scale[0], traits.scale[1]);
    const capacity = traits.fruit
      ? Math.max(1, Math.round(range(rand, traits.fruit * 0.5, traits.fruit)))
      : 0;
    const fruitSlots = capacity ? fruitSlotsFor(rand, capacity, scale) : [];

    trees.push({
      id: id++,
      kind,
      x,
      z,
      y,
      scale,
      rot: rand() * Math.PI * 2,
      fruit: capacity ? Math.floor(range(rand, 1, capacity + 1)) : 0,
      capacity,
      regrow: range(rand, 0, 40),
      wood: Math.round(traits.wood * range(rand, 0.7, 1.2)),
      fruitSlots,
    });
  }
  return trees;
}

/**
 * Boulders, clustered the way rock actually outcrops: a few fields of them
 * rather than an even sprinkle, and more of it on the high ground.
 */
export function scatterRocks(rand: Rand, terrain: Terrain, trees: Tree[]): Rock[] {
  const rocks: Rock[] = [];
  const fields: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * WORLD_RADIUS * 0.8;
    fields.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: range(rand, 7, 16) });
  }

  let id = 0;
  for (let i = 0; i < 9000 && rocks.length < 190; i++) {
    const field = fields[Math.floor(rand() * fields.length)];
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * field.r;
    const x = field.x + Math.cos(a) * d;
    const z = field.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > WORLD_RADIUS * 0.93) continue;
    const y = terrain.height(x, z);
    if (y < WATER_LEVEL + 0.25) continue;
    if (rocks.some((r) => Math.hypot(r.x - x, r.z - z) < 2.2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;

    const capacity = Math.round(range(rand, 60, 190) * (y > 1.6 ? 1.3 : 1));
    rocks.push({
      id: id++,
      x,
      z,
      y,
      scale: range(rand, 0.7, 1.5),
      rot: rand() * Math.PI * 2,
      stone: capacity,
      capacity,
    });
  }
  return rocks;
}

/**
 * Apples hang on the outside of the canopy rather than buried in it — a fruit
 * inside the leaves just shows up as a red sliver.
 */
export function fruitSlotsFor(rand: Rand, count: number, scale: number) {
  const slots: { x: number; y: number; z: number }[] = [];
  for (let f = 0; f < count; f++) {
    const a = rand() * Math.PI * 2;
    const e = range(rand, -0.35, 0.8);
    const r = range(rand, 0.58, 0.66) * scale;
    slots.push({
      x: Math.cos(a) * Math.cos(e) * r,
      y: (1.32 + Math.sin(e) * 0.62) * scale,
      z: Math.sin(a) * Math.cos(e) * r,
    });
  }
  return slots;
}

export function scatterBushes(rand: Rand, terrain: Terrain): Bush[] {
  const bushes: Bush[] = [];
  let id = 0;
  for (let i = 0; i < 12000 && bushes.length < 380; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * WORLD_RADIUS * 0.95;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = terrain.height(x, z);
    if (y < WATER_LEVEL + 0.3) continue;
    bushes.push({
      id: id++,
      x,
      z,
      y,
      scale: range(rand, 0.75, 1.3),
      berries: Math.floor(range(rand, 0, 4)),
      regrow: range(rand, 0, 30),
    });
  }
  return bushes;
}

export function scatterTubs(
  rand: Rand,
  terrain: Terrain,
  trees: Tree[],
): Tub[] {
  const tubs: Tub[] = [];
  for (let i = 0; i < 900 && tubs.length < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = range(rand, 5, WORLD_RADIUS * 0.7);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = terrain.height(x, z);
    if (y < WATER_LEVEL + 0.5) continue;
    if (tubs.some((t) => Math.hypot(t.x - x, t.z - z) < 12)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
    tubs.push({ x, z, y, rot: rand() * Math.PI * 2 });
  }
  return tubs;
}

/** A spot on land, away from water, suitable for spawning or building. */
export function findLandSpot(
  rand: Rand,
  terrain: Terrain,
  near?: { x: number; z: number },
  spread = WORLD_RADIUS * 0.8,
): { x: number; z: number } {
  // Remember the driest thing we saw, so a bad draw still lands somewhere
  // sensible instead of dumping everyone at the origin.
  let best = { x: 0, z: 0 };
  let bestH = terrain.height(0, 0);

  for (let i = 0; i < 120; i++) {
    let x: number;
    let z: number;
    if (near) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * spread;
      x = near.x + Math.cos(a) * d;
      z = near.z + Math.sin(a) * d;
    } else {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * WORLD_RADIUS * 0.8;
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
    }
    if (Math.hypot(x, z) > WORLD_RADIUS * 0.94) continue;
    const h = terrain.height(x, z);
    if (h > bestH) {
      bestH = h;
      best = { x, z };
    }
    if (h < WATER_LEVEL + 0.6) continue;
    return { x, z };
  }
  return best;
}
