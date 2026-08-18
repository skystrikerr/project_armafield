/** Seedable RNG and value noise, so a given map seed always builds the same battlefield. */

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rand: Rand, min: number, max: number) {
  return min + rand() * (max - min);
}

export function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
}

/** Roughly normal, clamped to [-1, 1]. Used for weapon dispersion. */
export function gauss(rand: Rand) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `from` towards `to` by at most `maxStep` radians. */
export function approachAngle(from: number, to: number, maxStep: number) {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

function hash2(seed: number, x: number, y: number) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bilinear value noise on the unit lattice, in [0, 1]. */
export function valueNoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(seed, xi, yi);
  const b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1);
  const d = hash2(seed, xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Stacked value noise. Returns roughly [0, 1]. */
export function fbm(seed: number, x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 1013, fx, fy);
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 1.97;
  }
  return sum / norm;
}

/** Ridged noise, for hill crests that read as terrain rather than blobs. */
export function ridge(seed: number, x: number, y: number, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (1 - Math.abs(valueNoise(seed + i * 7717, fx, fy) * 2 - 1));
    norm += amp;
    amp *= 0.5;
    fx *= 2.11;
    fy *= 2.03;
  }
  return sum / norm;
}
