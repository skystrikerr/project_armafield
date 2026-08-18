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

const LATERAL_NODES: { x: number; z: number }[] = [
  { x: -230, z: 55 },
  { x: -155, z: 30 },
  { x: -70, z: 6 },
  { x: 0, z: -15 },
  { x: 80, z: 4 },
  { x: 155, z: 25 },
  { x: 235, z: 48 },
];

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

export class Terrain {
  readonly seed: number;
  /** (GRID + 1)^2 heights, row-major in z. */
  readonly heights: Float32Array;
  readonly obstacles: Obstacle[] = [];
  readonly trees: TreeProp[] = [];
  readonly rocks: Prop[] = [];
  readonly clutter: Prop[] = [];

  constructor(seed: number) {
    this.seed = seed;
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

  /** Raw landform before roads and clearings are cut into it. */
  private rawHeight(x: number, z: number) {
    const s = this.seed;
    const rolling = (fbm(s, x * 0.0045, z * 0.0045, 4) - 0.5) * 34;
    const hills = Math.pow(ridge(s + 91, x * 0.0021, z * 0.0021, 3), 2.2) * 46;
    const detail = (fbm(s + 311, x * 0.02, z * 0.02, 3) - 0.5) * 3.2;
    // The middle of the map is a shallow valley, so the capture line is
    // overlooked from both flanks rather than being a flat plate.
    const valley = -18 * Math.exp(-((z + 10) * (z + 10)) / (150 * 150));
    // Ridge the map off at the edges so nothing drives out of the world.
    const edge = Math.max(Math.abs(x), Math.abs(z));
    const wall = smoothstep(MAP_HALF - 70, MAP_HALF - 6, edge) * 60;
    return rolling + hills + detail + valley + wall;
  }

  /** Landform with roads graded flat and the villages levelled. */
  private shapedHeight(x: number, z: number) {
    let h = this.rawHeight(x, z);

    // Roads: pull the ground towards the height at the nearest road centre.
    for (const nodes of [ROAD_NODES, LATERAL_NODES]) {
      const d = polylineDistance(x, z, nodes);
      if (d < 26) {
        const w = 1 - smoothstep(7, 26, d);
        h = lerp(h, this.roadHeight(x, z, nodes), w * 0.9);
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

    // Woodland, thickest on the flanks where the capture line is not.
    const treeKinds = ["pine", "pine", "oak", "birch"] as const;
    for (let i = 0; i < 1900; i++) {
      const x = range(rand, -MAP_HALF + 12, MAP_HALF - 12);
      const z = range(rand, -MAP_HALF + 12, MAP_HALF - 12);
      const y = this.heightAt(x, z);
      if (this.slopeAt(x, z) > 0.62) continue;
      if (this.roadiness(x, z) > 0.25) continue;
      if (this.nearFeature(x, z, 0.85)) continue;
      const density = fbm(this.seed + 77, x * 0.006, z * 0.006, 3);
      if (rand() > density * 1.25) continue;
      if (this.obstructed(x, z, 3)) continue;
      this.trees.push({
        x,
        y,
        z,
        rot: rand() * Math.PI * 2,
        scale: range(rand, 0.75, 1.45),
        kind: pick(rand, treeKinds),
        fall: 0,
        fallDir: rand() * Math.PI * 2,
        falling: false,
      });
    }

    for (let i = 0; i < 240; i++) {
      const x = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      const z = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      if (this.roadiness(x, z) > 0.3) continue;
      const steep = this.slopeAt(x, z);
      if (steep < 0.2 && rand() < 0.6) continue;
      const scale = range(rand, 1.1, 3.4);
      const y = this.heightAt(x, z);
      this.rocks.push({ x, y, z, rot: rand() * Math.PI * 2, scale, kind: "rock" });
      if (scale > 2.1) {
        this.obstacles.push(box(x, y + scale * 0.6, z, scale * 0.9, scale * 0.7, scale * 0.9, 0, true));
      }
    }

    // Bushes and fence posts: cover that reads at a distance.
    for (let i = 0; i < 700; i++) {
      const x = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      const z = range(rand, -MAP_HALF + 10, MAP_HALF - 10);
      if (this.slopeAt(x, z) > 0.55) continue;
      this.clutter.push({
        x,
        y: this.heightAt(x, z),
        z,
        rot: rand() * Math.PI * 2,
        scale: range(rand, 0.7, 1.5),
        kind: rand() < 0.75 ? "bush" : "stump",
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
    const dry = fbm(this.seed + 55, x * 0.008, z * 0.008, 3);
    if (slope > 0.55) {
      out.setHex(0x6f6a60);
    } else if (road > 0.45) {
      out.setHex(0x8b7350);
    } else if (slope > 0.34) {
      out.setHex(0x7d7856);
    } else if (dry > 0.62) {
      out.setHex(0x8f9455);
    } else if (dry < 0.38) {
      out.setHex(0x556e3a);
    } else {
      out.setHex(0x6a8442);
    }
    // Snow-free hills, but let the crests go pale so elevation reads.
    if (y > 34) out.lerp(_tmpColor.setHex(0x9aa08c), smoothstep(34, 62, y) * 0.6);
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
