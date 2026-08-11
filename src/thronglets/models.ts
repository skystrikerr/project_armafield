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

export function throngletGeometries() {
  const body = bake(throngletBodyGrid(), CREATURE_PALETTE, {
    scale: VOX,
    origin: [4.5, 0, 3],
  });
  const head = bake(throngletHeadGrid(), CREATURE_PALETTE, {
    scale: VOX,
    origin: [6.5, 3, 3],
  });
  return { body, head };
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
