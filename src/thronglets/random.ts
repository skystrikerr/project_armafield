/** Seedable RNG so a given world seed always grows the same island. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

export function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

export function range(rand: Rand, min: number, max: number) {
  return min + rand() * (max - min);
}

/** Roughly normal distribution, clamped to [-1, 1]. */
export function gauss(rand: Rand) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}
