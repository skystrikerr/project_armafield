import * as THREE from "three";

/**
 * Tiny voxel toolkit.
 *
 * Models are authored in a 3D grid of colour keys and baked into a single
 * BufferGeometry with vertex colours. Interior faces are culled, so a chunky
 * pixel-art creature ends up being a few hundred triangles instead of a few
 * thousand.
 */

export type VoxelGrid = {
  sx: number;
  sy: number;
  sz: number;
  data: Int16Array; // -1 = empty, otherwise index into the palette
};

export function createGrid(sx: number, sy: number, sz: number): VoxelGrid {
  const data = new Int16Array(sx * sy * sz).fill(-1);
  return { sx, sy, sz, data };
}

function idx(g: VoxelGrid, x: number, y: number, z: number) {
  return x + g.sx * (y + g.sy * z);
}

export function inside(g: VoxelGrid, x: number, y: number, z: number) {
  return x >= 0 && y >= 0 && z >= 0 && x < g.sx && y < g.sy && z < g.sz;
}

export function get(g: VoxelGrid, x: number, y: number, z: number) {
  if (!inside(g, x, y, z)) return -1;
  return g.data[idx(g, x, y, z)];
}

export function set(g: VoxelGrid, x: number, y: number, z: number, c: number) {
  if (!inside(g, x, y, z)) return;
  g.data[idx(g, x, y, z)] = c;
}

/** Inclusive box fill. */
export function fill(
  g: VoxelGrid,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  c: number,
) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) set(g, x, y, z, c);
}

/** Mirror everything on the left half of X onto the right half. */
export function mirrorX(g: VoxelGrid) {
  for (let x = 0; x < Math.floor(g.sx / 2); x++)
    for (let y = 0; y < g.sy; y++)
      for (let z = 0; z < g.sz; z++) {
        const c = get(g, x, y, z);
        if (c >= 0) set(g, g.sx - 1 - x, y, z, c);
      }
}

/**
 * Fill single-voxel pinholes so thin shells (tree canopies, bushes) don't let
 * the sky leak through as bright specks.
 */
export function closeGaps(g: VoxelGrid, threshold = 4) {
  const before = g.data.slice();
  const peek = (x: number, y: number, z: number) =>
    inside(g, x, y, z) ? before[idx(g, x, y, z)] : -1;

  for (let x = 0; x < g.sx; x++)
    for (let y = 0; y < g.sy; y++)
      for (let z = 0; z < g.sz; z++) {
        if (peek(x, y, z) >= 0) continue;
        const n = [
          peek(x + 1, y, z),
          peek(x - 1, y, z),
          peek(x, y + 1, z),
          peek(x, y - 1, z),
          peek(x, y, z + 1),
          peek(x, y, z - 1),
        ].filter((c) => c >= 0);
        if (n.length >= threshold) set(g, x, y, z, n[0]);
      }
}

type Face = {
  dir: [number, number, number];
  corners: [number, number, number][];
};

const FACES: Face[] = [
  // +X
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  // -X
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  // +Y
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  // -Y
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  // +Z
  {
    dir: [0, 0, 1],
    corners: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  // -Z
  {
    dir: [0, 0, -1],
    corners: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
];

export type BakeOptions = {
  /** World size of one voxel. */
  scale?: number;
  /** Grid-space origin that becomes (0,0,0) in the baked geometry. */
  origin?: [number, number, number];
  /** Fake ambient occlusion strength applied per face (0 disables). */
  shade?: number;
};

/**
 * Bake a voxel grid into a vertex-coloured geometry, culling hidden faces.
 */
export function bake(
  g: VoxelGrid,
  palette: number[],
  opts: BakeOptions = {},
): THREE.BufferGeometry {
  const scale = opts.scale ?? 0.1;
  const [ox, oy, oz] = opts.origin ?? [g.sx / 2, 0, g.sz / 2];
  const shade = opts.shade ?? 0.16;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const col = new THREE.Color();

  for (let x = 0; x < g.sx; x++) {
    for (let y = 0; y < g.sy; y++) {
      for (let z = 0; z < g.sz; z++) {
        const c = get(g, x, y, z);
        if (c < 0) continue;
        col.setHex(palette[c] ?? 0xff00ff).convertSRGBToLinear();

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          if (get(g, x + dx, y + dy, z + dz) >= 0) continue;

          // Cheap directional shading so the silhouette stays readable even
          // when the creature is lit flatly. Scaling (rather than offsetting)
          // keeps the hue intact — an offset in linear space would swamp the
          // small blue channel and turn every yellow orange.
          let k = 1;
          if (dy > 0) k = 1 + shade;
          else if (dy < 0) k = 1 - shade * 1.4;
          else if (dz !== 0) k = 1 - shade * 0.45;
          else k = 1 - shade * 0.2;

          const r = THREE.MathUtils.clamp(col.r * k, 0, 1);
          const gg = THREE.MathUtils.clamp(col.g * k, 0, 1);
          const b = THREE.MathUtils.clamp(col.b * k, 0, 1);

          const base = positions.length / 3;
          for (const [cx, cy, cz] of face.corners) {
            positions.push(
              (x + cx - ox) * scale,
              (y + cy - oy) * scale,
              (z + cz - oz) * scale,
            );
            normals.push(dx, dy, dz);
            colors.push(r, gg, b);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}
