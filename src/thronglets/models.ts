import * as THREE from "three";
import {
  bake,
  closeGaps,
  createGrid,
  fill,
  mirrorX,
  set,
  type VoxelGrid,
} from "./voxel";

/**
 * Voxel models for the colony. Everything is authored in a pixel-art palette
 * so the 3D creatures read like the sprites they are based on: fat yellow
 * bodies, two drooping ear-tufts, huge eyes, a blue wrap around the middle.
 */

export const VOX = 0.09; // world units per voxel

// Palette slots shared by the creature models.
const YEL = 0;
const YEL_D = 1;
const YEL_L = 2;
const BLU = 3;
const BLU_D = 4;
const WHT = 5;
const BLK = 6;
const PNK = 7;
const BRN = 8;

/**
 * Colour schemes. A morph is baked as its own geometry rather than tinted, so
 * a blue thronglet really has a blue body and a pale belly rather than a
 * yellow one under a filter.
 */
export const MORPHS: { name: string; palette: number[] }[] = [
  {
    name: "amber",
    palette: [0xf6cf5a, 0xe3ae42, 0xffe89a, 0x74bcd8, 0x3d7fa3, 0xfdfdf5, 0x22201c, 0xe98d9a, 0x8a5a32],
  },
  {
    name: "moss",
    palette: [0x9fd45e, 0x7cae45, 0xd6f0a0, 0xd98c5f, 0xa8613d, 0xfdfdf5, 0x1f2418, 0xe0a3b4, 0x6d5a34],
  },
  {
    name: "tide",
    palette: [0x6fc4dd, 0x4b9cb5, 0xb9e9f5, 0xf0d264, 0xc2a03e, 0xfdfdf5, 0x18242a, 0xe98d9a, 0x4d6a78],
  },
  {
    name: "rose",
    palette: [0xf0a2b4, 0xd07f92, 0xffd6e0, 0x8fd7a8, 0x5da97a, 0xfdfdf5, 0x2a1c22, 0xd4607a, 0x8a5a5f],
  },
  {
    name: "ash",
    palette: [0xd9d3c4, 0xb3ab9a, 0xf4f0e6, 0x8d8fb5, 0x5f6288, 0xfdfdf5, 0x22201c, 0xd08c8c, 0x6f6a5c],
  },
  {
    name: "ember",
    palette: [0xef9a52, 0xcb7734, 0xffd0a0, 0x5f8fb5, 0x3d6a88, 0xfdfdf5, 0x2a1a14, 0xe86a5c, 0x8a4a28],
  },
  {
    name: "dusk",
    palette: [0xa997dd, 0x8676b8, 0xd8ccf5, 0xe0c05a, 0xb2933a, 0xfdfdf5, 0x1d1826, 0xe08bb5, 0x5f5484],
  },
];

export const CREATURE_PALETTE = [
  0xf6cf5a, // YEL   body
  0xe3ae42, // YEL_D shade
  0xffe89a, // YEL_L highlight
  0x74bcd8, // BLU   wrap
  0x3d7fa3, // BLU_D wrap shade
  0xfdfdf5, // WHT   eyes
  0x22201c, // BLK   pupils / feet / outline
  0xe98d9a, // PNK   cheeks
  0x8a5a32, // BRN
];

/* ------------------------------------------------------------------ */
/* Thronglet                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lower half: legs, torso and the blue wrap. Pivot sits between the feet.
 */
function throngletBodyGrid(): VoxelGrid {
  const g = createGrid(9, 8, 6);

  // Feet.
  fill(g, 2, 3, 0, 0, 1, 4, BLK);
  fill(g, 5, 6, 0, 0, 1, 4, BLK);

  // Torso — narrower than the head, so the head stays the star.
  fill(g, 2, 6, 1, 6, 1, 4, YEL);

  // The blue wrap around the middle.
  fill(g, 2, 6, 1, 3, 1, 4, BLU);
  fill(g, 2, 6, 1, 1, 1, 4, BLU_D);

  // Stubby arms.
  fill(g, 1, 1, 3, 5, 2, 3, YEL);
  fill(g, 7, 7, 3, 5, 2, 3, YEL);
  set(g, 1, 3, 2, YEL_D);
  set(g, 7, 3, 2, YEL_D);

  // Rounded shoulders.
  set(g, 2, 6, 1, -1);
  set(g, 6, 6, 1, -1);
  set(g, 2, 6, 4, -1);
  set(g, 6, 6, 4, -1);

  return g;
}

/**
 * Upper half: head, the two drooping ear-tufts, the face. Pivot sits at the
 * neck so the head can nod and tilt independently of the body.
 */
function throngletHeadGrid(): VoxelGrid {
  const g = createGrid(13, 12, 7);
  const F = 5; // front-facing layer of the skull

  // Skull: tall and boxy, taking up more of the silhouette than the body.
  fill(g, 3, 9, 3, 10, 1, F, YEL);
  // Knock the corners off.
  for (const [x, y] of [
    [3, 10],
    [9, 10],
    [3, 3],
    [9, 3],
  ] as [number, number][]) {
    fill(g, x, x, y, y, 1, F, -1);
  }
  // Side shading.
  fill(g, 3, 3, 4, 9, 1, 2, YEL_D);
  fill(g, 9, 9, 4, 9, 1, 2, YEL_D);

  // Ear-tufts: hung from the top corners of the skull, drooping past the jaw,
  // with a darker rounded tip — the two dangling tufts from the sprite.
  fill(g, 1, 2, 2, 10, 2, 5, YEL);
  fill(g, 1, 2, 2, 3, 2, 5, YEL_D);
  mirrorX(g);
  // Round the outer corners (mirrorX only copies filled cells).
  for (const x of [1, 11]) {
    fill(g, x, x, 10, 10, 2, 5, -1);
    fill(g, x, x, 2, 2, 2, 5, -1);
  }

  // Sprout on the crown.
  set(g, 6, 11, 3, YEL);
  set(g, 6, 11, 2, YEL_D);

  // Big wide-set eyes: white block, one heavy pupil pixel each.
  fill(g, 4, 5, 5, 7, F, F, WHT);
  fill(g, 7, 8, 5, 7, F, F, WHT);
  set(g, 5, 6, F, BLK);
  set(g, 7, 6, F, BLK);

  // Cheeks + mouth.
  set(g, 3, 5, F, PNK);
  set(g, 9, 5, F, PNK);
  set(g, 6, 4, F, BLK);

  return g;
}

export function throngletGeometries(palette: number[] = CREATURE_PALETTE) {
  const body = bake(throngletBodyGrid(), palette, {
    scale: VOX,
    origin: [4.5, 0, 3],
  });
  const head = bake(throngletHeadGrid(), palette, {
    scale: VOX,
    origin: [6.5, 3, 3],
  });
  return { body, head };
}

/** One baked pair per colour scheme. */
export function morphGeometries() {
  return MORPHS.map((m) => ({ name: m.name, ...throngletGeometries(m.palette) }));
}

/** Neck height in world units — where the head geometry gets parked. */
export const NECK_HEIGHT = 6.4 * VOX;
/** Roughly how tall a full-grown thronglet stands. */
export const THRONGLET_HEIGHT = 15 * VOX;

/* ------------------------------------------------------------------ */
/* Egg                                                                 */
/* ------------------------------------------------------------------ */

export function eggGeometry() {
  const P = [0xfdf3d8, 0xe8d5a8, 0xf6cf5a];
  const g = createGrid(6, 8, 6);
  fill(g, 1, 4, 0, 6, 1, 4, 0);
  fill(g, 2, 3, 7, 7, 2, 3, 0);
  fill(g, 0, 0, 2, 4, 2, 3, 0);
  fill(g, 5, 5, 2, 4, 2, 3, 0);
  fill(g, 1, 4, 0, 1, 1, 4, 1);
  set(g, 2, 4, 5, 2);
  set(g, 3, 3, 5, 2);
  return bake(g, P, { scale: VOX * 0.9, origin: [3, 0, 3] });
}

/* ------------------------------------------------------------------ */
/* Flora                                                               */
/* ------------------------------------------------------------------ */

/** The apple tree: round, generous, the one they live off. */
export function treeGeometry() {
  const P = [0x7a5330, 0x99663a, 0x3f9440, 0x54ad4a, 0x6fc95c];
  const g = createGrid(15, 22, 15);
  const cx = 7;
  const cz = 7;

  // Trunk with a couple of knots.
  fill(g, cx - 1, cx + 1, 0, 10, cz - 1, cz + 1, 0);
  fill(g, cx - 1, cx + 1, 3, 4, cz - 1, cz + 1, 1);
  set(g, cx - 2, 6, cz, 1);
  set(g, cx + 2, 8, cz, 1);

  // Blobby canopy: three overlapping spheres, mildly irregular.
  const blobs: [number, number, number, number][] = [
    [cx, 15, cz, 6.4],
    [cx - 3, 12.5, cz + 1, 4.8],
    [cx + 3, 13, cz - 2, 5.0],
    [cx, 12, cz - 1, 4.6],
  ];
  for (let x = 0; x < 15; x++)
    for (let y = 8; y < 22; y++)
      for (let z = 0; z < 15; z++) {
        for (const [bx, by, bz, r] of blobs) {
          const d = Math.hypot(x - bx, (y - by) * 1.05, z - bz);
          if (d > r) continue;
          const shade = d > r - 1.1 ? 2 : y > 15 ? 4 : 3;
          set(g, x, y, z, shade);
          break;
        }
      }

  closeGaps(g, 3);
  return bake(g, P, { scale: VOX, origin: [cx + 0.5, 0, cz + 0.5] });
}

/** Oak: broad, heavy in the trunk, the best wood on the island. */
export function oakGeometry() {
  const P = [0x6b4a2a, 0x836039, 0x2f7a38, 0x409445, 0x58ad55];
  const g = createGrid(19, 26, 19);
  const c = 9;

  fill(g, c - 2, c + 2, 0, 12, c - 2, c + 2, 0);
  fill(g, c - 2, c + 2, 4, 5, c - 2, c + 2, 1);
  // Two boughs reaching out before the canopy starts.
  fill(g, c - 5, c - 3, 10, 11, c - 1, c + 1, 0);
  fill(g, c + 3, c + 5, 11, 12, c - 1, c + 1, 0);

  const blobs: [number, number, number, number][] = [
    [c, 18, c, 8.2],
    [c - 5, 15, c + 2, 5.6],
    [c + 5, 16, c - 2, 5.8],
    [c + 1, 14, c + 4, 5.2],
  ];
  for (let x = 0; x < 19; x++)
    for (let y = 11; y < 26; y++)
      for (let z = 0; z < 19; z++) {
        for (const [bx, by, bz, r] of blobs) {
          const d = Math.hypot(x - bx, (y - by) * 1.1, z - bz);
          if (d > r) continue;
          set(g, x, y, z, d > r - 1.2 ? 2 : y > 18 ? 4 : 3);
          break;
        }
      }
  closeGaps(g, 3);
  return bake(g, P, { scale: VOX, origin: [c + 0.5, 0, c + 0.5] });
}

/** Pine: tall and narrow, holds the high ground. */
export function pineGeometry() {
  const P = [0x5d4227, 0x74522f, 0x1f5c33, 0x2a7440, 0x378c4c];
  const g = createGrid(13, 34, 13);
  const c = 6;

  fill(g, c - 1, c + 1, 0, 26, c - 1, c + 1, 0);
  fill(g, c - 1, c + 1, 6, 7, c - 1, c + 1, 1);

  // Stacked skirts, narrowing towards the top.
  for (let tier = 0; tier < 5; tier++) {
    const base = 9 + tier * 5;
    const radius = 5.6 - tier * 0.95;
    for (let y = base; y < base + 6; y++) {
      const r = radius * (1 - (y - base) / 6.5);
      for (let x = 0; x < 13; x++)
        for (let z = 0; z < 13; z++) {
          const d = Math.hypot(x - c, z - c);
          if (d <= r) set(g, x, y, z, d > r - 0.9 ? 2 : y % 3 === 0 ? 3 : 4);
        }
    }
  }
  fill(g, c, c, 32, 33, c, c, 4);
  closeGaps(g, 4);
  return bake(g, P, { scale: VOX, origin: [c + 0.5, 0, c + 0.5] });
}

/** Palm: leans over the shoreline, drops coconuts. */
export function palmGeometry() {
  const P = [0x9a7448, 0xb08c5a, 0x3f9455, 0x55b06a, 0x6b5230];
  const g = createGrid(21, 30, 21);
  const c = 10;

  // Curved trunk.
  for (let y = 0; y <= 21; y++) {
    const lean = Math.round(Math.pow(y / 21, 2) * 3);
    fill(g, c + lean - 1, c + lean, y, y, c - 1, c, y % 5 === 0 ? 1 : 0);
  }
  const tx = c + 3;
  // Fronds drooping from the crown.
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2;
    for (let l = 1; l <= 8; l++) {
      const x = Math.round(tx + Math.cos(a) * l);
      const z = Math.round(c + Math.sin(a) * l);
      const y = 22 + Math.round(2 - (l * l) / 14);
      set(g, x, y, z, l > 5 ? 2 : 3);
      if (l < 6) {
        set(g, x + Math.round(Math.sin(a)), y, z - Math.round(Math.cos(a)), 2);
      }
    }
  }
  fill(g, tx - 1, tx + 1, 21, 22, c - 1, c + 1, 4);
  return bake(g, P, { scale: VOX, origin: [c + 0.5, 0, c + 0.5] });
}

/** A boulder to quarry. */
export function rockGeometry() {
  const P = [0x8d8f92, 0xa7a9ad, 0x6f7175, 0x5c5e62];
  const g = createGrid(13, 10, 13);
  const blobs: [number, number, number, number][] = [
    [6, 3, 6, 5.4],
    [3, 2, 7, 3.4],
    [8, 2, 4, 3.8],
    [7, 5, 8, 3.2],
  ];
  for (let x = 0; x < 13; x++)
    for (let y = 0; y < 10; y++)
      for (let z = 0; z < 13; z++) {
        for (const [bx, by, bz, r] of blobs) {
          const d = Math.hypot(x - bx, (y - by) * 1.35, z - bz);
          if (d > r) continue;
          set(g, x, y, z, y > by ? 1 : d > r - 1 ? 2 : 0);
          break;
        }
      }
  // A seam of darker stone.
  for (let x = 1; x < 12; x++) if ((x + 3) % 4 === 0) set(g, x, 4, 6, 3);
  closeGaps(g, 3);
  return bake(g, P, { scale: VOX, origin: [6.5, 0, 6.5] });
}

/** The load of stone they carry back from a boulder. */
export function stoneLoadGeometry() {
  const P = [0x9aa0a6, 0x76797e, 0xb6bbc0];
  const g = createGrid(7, 4, 5);
  fill(g, 0, 6, 0, 1, 0, 4, 0);
  fill(g, 1, 5, 2, 2, 1, 3, 2);
  set(g, 0, 0, 0, 1);
  set(g, 6, 0, 4, 1);
  set(g, 3, 3, 2, 1);
  return bake(g, P, { scale: VOX * 0.8, origin: [3, 0, 2] });
}

export function appleGeometry() {
  const P = [0xe0433a, 0xf87a6c, 0x4f9433];
  const g = createGrid(4, 5, 4);
  fill(g, 0, 3, 0, 3, 0, 3, 0);
  fill(g, 1, 2, 1, 2, 3, 3, 1);
  set(g, 1, 4, 1, 2);
  return bake(g, P, { scale: VOX * 0.7, origin: [2, 2, 2] });
}

export function bushGeometry() {
  const P = [0x3a8340, 0x55a552, 0xb254c0];
  const g = createGrid(9, 7, 9);
  for (let x = 0; x < 9; x++)
    for (let y = 0; y < 7; y++)
      for (let z = 0; z < 9; z++) {
        const d = Math.hypot(x - 4, (y - 2) * 1.5, z - 4);
        if (d < 4) set(g, x, y, z, y >= 3 && d < 3.4 ? 1 : 0);
      }
  closeGaps(g, 3);
  set(g, 2, 4, 4, 2);
  set(g, 6, 3, 3, 2);
  set(g, 4, 5, 6, 2);
  return bake(g, P, { scale: VOX, origin: [4.5, 0, 4.5] });
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

/** The enamel tub the colony bathes and plays in. */
export function tubGeometry() {
  const P = [0xe8ecef, 0xb9c2c9, 0x8fd0e8, 0xd8b45a];
  const g = createGrid(20, 9, 12);
  // Outer shell.
  fill(g, 0, 19, 1, 7, 0, 11, 0);
  // Hollow it out.
  fill(g, 1, 18, 3, 8, 1, 10, -1);
  // Water line.
  fill(g, 1, 18, 3, 5, 1, 10, 2);
  // Rim shading + little clawed feet.
  fill(g, 0, 19, 7, 7, 0, 0, 1);
  fill(g, 0, 19, 7, 7, 11, 11, 1);
  for (const x of [1, 17])
    for (const z of [1, 9]) fill(g, x, x + 1, 0, 1, z, z + 1, 3);
  return bake(g, P, { scale: VOX, origin: [10, 0, 6] });
}

/** A clan's banner, planted at the centre of its village and tinted per clan. */
export function bannerGeometry() {
  const P = [0x6b4726, 0xffffff, 0xd9d2c4];
  const g = createGrid(9, 22, 3);
  fill(g, 0, 0, 0, 21, 1, 1, 0);
  fill(g, 0, 2, 0, 0, 0, 2, 0);
  // Cloth — left white so the instance colour carries the clan's hue.
  fill(g, 1, 8, 14, 20, 1, 1, 1);
  fill(g, 1, 8, 14, 14, 1, 1, 2);
  set(g, 8, 20, 1, 2);
  set(g, 8, 15, 1, 2);
  return bake(g, P, { scale: VOX, origin: [0.5, 0, 1.5] });
}

/** The bundle of logs a thronglet carries back to a build site. */
export function plankGeometry() {
  const P = [0x9c6c3c, 0x744d29, 0xb98a52];
  const g = createGrid(8, 3, 4);
  fill(g, 0, 7, 0, 1, 0, 2, 0);
  fill(g, 0, 0, 0, 1, 0, 2, 1);
  fill(g, 7, 7, 0, 1, 0, 2, 1);
  fill(g, 1, 6, 2, 2, 1, 2, 2);
  return bake(g, P, { scale: VOX * 0.8, origin: [4, 0, 1.5] });
}

/** A single build block — instanced and tinted per structure. */
export function blockGeometry(size = VOX * 2.4) {
  return new THREE.BoxGeometry(size, size, size);
}
