import { gauss, mulberry32, pick, range, type Rand } from "./random";
import {
  findLandSpot,
  fruitSlotsFor,
  scatterBushes,
  scatterPonds,
  scatterTrees,
  scatterTubs,
  WATER_LEVEL,
  WORLD_RADIUS,
  type Bush,
  type Terrain,
  type Tree,
  type Tub,
} from "./world";

/**
 * The simulation itself — no three.js in here. Agents sense the world, score a
 * handful of competing drives, pick the winner and act on it. Nothing is
 * scripted: colonies, buildings and family trees are whatever falls out of
 * those drives interacting.
 */

export const BLOCK = 0.3;

/** Side of one spatial-index cell, a little wider than the separation radius. */
const CELL = 1.6;

/** How far a finished structure keeps wandering thronglets out. */
const FOOTPRINT: Record<StructureKind, number> = {
  cairn: 0.7,
  hut: 1.5,
  farm: 0,
  tower: 1.0,
  monolith: 1.2,
};
export const DAY_LENGTH = 150; // sim seconds for a full day/night cycle
export const POP_CAP = 140;

export type Task =
  | "idle"
  | "wander"
  | "seekFood"
  | "eat"
  | "seekWater"
  | "drink"
  | "sleep"
  | "socialize"
  | "play"
  | "gather"
  | "build"
  | "mate";

export type Genome = {
  speed: number;
  size: number;
  curiosity: number;
  sociability: number;
  industry: number;
  hue: number;
  lifespan: number;
};

export type Memory = { x: number; z: number; kind: "food" | "water" };

export type Thronglet = {
  id: number;
  name: string;
  gen: number;
  parents: [number, number] | null;
  parentNames: [string, string] | null;

  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  heading: number;

  age: number;
  stage: "baby" | "child" | "adult" | "elder";
  scale: number;
  alive: boolean;

  hunger: number;
  thirst: number;
  energy: number;
  social: number;
  joy: number;
  health: number;

  genome: Genome;

  task: Task;
  taskTimer: number;
  thinkTimer: number;
  thought: string;
  target: { x: number; z: number } | null;
  targetTree: number | null;
  targetSite: number | null;
  partner: number | null;
  mateCooldown: number;

  /** Seconds spent on the current task — a watchdog against unreachable goals. */
  stuck: number;

  carryingWood: number;
  blocksPlaced: number;
  mealsEaten: number;
  childCount: number;

  memory: Memory[];
  /** Little animation helpers the renderer reads. */
  bob: number;
  hop: number;
  emote: { icon: string; t: number } | null;
};

export type Egg = {
  id: number;
  x: number;
  z: number;
  y: number;
  timer: number;
  genome: Genome;
  parents: [number, number];
  parentNames: [string, string];
  gen: number;
};

export type Block = { x: number; y: number; z: number; color: number };

export type StructureKind = "cairn" | "hut" | "farm" | "tower" | "monolith";

export type BuildSite = {
  id: number;
  kind: StructureKind;
  x: number;
  z: number;
  y: number;
  blocks: Block[];
  placed: number;
  wood: number;
  woodNeeded: number;
  complete: boolean;
};

export type LogEntry = { t: number; text: string; kind: string };

export type ColonyStats = {
  population: number;
  eggs: number;
  generation: number;
  knowledge: number;
  structures: number;
  births: number;
  deaths: number;
  blocks: number;
  tier: string;
};

const SYL_A = [
  "thr",
  "gl",
  "b",
  "n",
  "p",
  "t",
  "k",
  "m",
  "z",
  "v",
  "fl",
  "sn",
  "j",
  "r",
];
const SYL_B = ["o", "i", "u", "e", "a", "ee", "oo", "y"];
const SYL_C = [
  "ng",
  "b",
  "p",
  "t",
  "k",
  "x",
  "m",
  "n",
  "l",
  "sh",
  "ff",
  "zz",
  "d",
];

function makeName(rand: Rand) {
  const n = pick(rand, SYL_A) + pick(rand, SYL_B) + pick(rand, SYL_C);
  return n[0].toUpperCase() + n.slice(1);
}

const STRUCTURE_TIERS: {
  kind: StructureKind;
  label: string;
  knowledge: number;
  wood: number;
}[] = [
  { kind: "cairn", label: "Cairn", knowledge: 0, wood: 12 },
  { kind: "hut", label: "Hut", knowledge: 25, wood: 70 },
  { kind: "farm", label: "Grove plot", knowledge: 90, wood: 60 },
  { kind: "tower", label: "Watchtower", knowledge: 220, wood: 130 },
  { kind: "monolith", label: "Monolith", knowledge: 450, wood: 190 },
];

export const TIER_NAMES = [
  "Scattered",
  "Nesting",
  "Settled",
  "Cultivating",
  "Watchful",
  "Ascendant",
];

/* ------------------------------------------------------------------ */
/* Structure layouts                                                   */
/* ------------------------------------------------------------------ */

function layout(kind: StructureKind, rand: Rand): Block[] {
  const b: Block[] = [];
  const wood = 0xa9763f;
  const woodDark = 0x7d5227;
  const stone = 0x9aa0a6;
  const stoneDark = 0x70767c;
  const leaf = 0x4f9b3d;
  const dirt = 0x6d5133;
  const dark = 0x22262b;

  const push = (x: number, y: number, z: number, color: number) =>
    b.push({ x, y, z, color });

  if (kind === "cairn") {
    push(0, 0, 0, stone);
    push(1, 0, 0, stoneDark);
    push(0, 0, 1, stoneDark);
    push(-1, 0, 0, stone);
    push(0, 0, -1, stone);
    push(0, 1, 0, stone);
    push(1, 1, 0, stoneDark);
    push(0, 1, 1, stone);
    push(0, 2, 0, stoneDark);
    push(0, 3, 0, stone);
  } else if (kind === "hut") {
    const R = 3;
    for (let y = 0; y < 4; y++)
      for (let x = -R; x <= R; x++)
        for (let z = -R; z <= R; z++) {
          const edge = Math.abs(x) === R || Math.abs(z) === R;
          if (!edge) continue;
          if (y < 3 && (x === 0 || x === 1) && z === R) continue; // doorway
          push(x, y, z, y === 0 ? woodDark : wood);
        }
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) push(x, 4, z, woodDark);
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) push(x, 5, z, leaf);
    push(0, 6, 0, leaf);
  } else if (kind === "farm") {
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        const border = Math.abs(x) === 3 || Math.abs(z) === 3;
        if (border) {
          if ((x + z) % 2 === 0) push(x, 0, z, woodDark);
          continue;
        }
        push(x, 0, z, dirt);
        if (z % 2 === 0) push(x, 1, z, leaf);
      }
  } else if (kind === "tower") {
    for (let y = 0; y < 12; y++)
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          if (y > 0 && x === 0 && z === 0) continue;
          push(x, y, z, y % 3 === 0 ? stoneDark : stone);
        }
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 2 || Math.abs(z) === 2) push(x, 12, z, wood);
      }
    push(0, 13, 0, 0xf0d264);
  } else {
    // The monolith: a black slab of stacked "compute" the colony feeds.
    for (let y = 0; y < 14; y++)
      for (let x = -2; x <= 2; x++)
        for (let z = -1; z <= 1; z++) {
          const shell =
            Math.abs(x) === 2 || Math.abs(z) === 1 || y === 0 || y === 13;
          if (!shell) continue;
          const glow = y % 3 === 1 && Math.abs(x) < 2 && z === 1;
          push(x, y, z, glow ? 0x63e0b6 : y % 4 === 0 ? 0x33383f : dark);
        }
  }

  // Build bottom-up, with a little jitter so two structures never rise in
  // exactly the same order.
  return b.sort((p, q) => p.y - q.y + (rand() - 0.5) * 0.4);
}

/* ------------------------------------------------------------------ */
/* Colony                                                              */
/* ------------------------------------------------------------------ */

export class Colony {
  rand: Rand;
  terrain: Terrain;
  trees: Tree[] = [];
  bushes: Bush[] = [];
  tubs: Tub[] = [];
  thronglets: Thronglet[] = [];
  eggs: Egg[] = [];
  sites: BuildSite[] = [];
  drops: { x: number; z: number; y: number; life: number }[] = [];

  time = DAY_LENGTH * 0.18; // start mid-morning
  /** Population sampled over time, for the chart in the HUD. */
  history: number[] = [];
  private historyTimer = 0;
  knowledge = 0;
  births = 0;
  deaths = 0;
  generation = 1;
  log: LogEntry[] = [];

  /** Agents bucketed by cell, rebuilt each tick so crowd checks stay local. */
  private grid = new Map<number, Thronglet[]>();
  private nextId = 1;
  private nextSiteId = 1;
  private planCooldown = 6;

  constructor(
    seed: number,
    makeTerrain: (seed: number, ponds: ReturnType<typeof scatterPonds>) => Terrain,
  ) {
    this.rand = mulberry32(seed);
    const ponds = scatterPonds(this.rand);
    this.terrain = makeTerrain(seed, ponds);
    this.trees = scatterTrees(this.rand, this.terrain);
    this.bushes = scatterBushes(this.rand, this.terrain);
    this.tubs = scatterTubs(this.rand, this.terrain, this.trees);

    const start = findLandSpot(this.rand, this.terrain);
    for (let i = 0; i < 8; i++) {
      const spot = findLandSpot(this.rand, this.terrain, start, 6);
      this.spawn(spot.x, spot.z, this.randomGenome(), 1, null, i < 4 ? 40 : 12);
    }
    this.addLog("Eight thronglets blink awake.", "spawn");
  }

  /* ---------------- lifecycle ---------------- */

  randomGenome(): Genome {
    const r = this.rand;
    return {
      speed: range(r, 0.8, 1.35),
      size: range(r, 0.9, 1.12),
      curiosity: range(r, 0.15, 0.95),
      sociability: range(r, 0.2, 0.95),
      industry: range(r, 0.2, 0.95),
      hue: range(r, -0.05, 0.05),
      lifespan: range(r, 380, 620),
    };
  }

  mixGenome(a: Genome, b: Genome): Genome {
    const r = this.rand;
    const mix = (k: keyof Genome, lo: number, hi: number) => {
      const base = r() < 0.5 ? a[k] : b[k];
      return Math.min(hi, Math.max(lo, base + gauss(r) * (hi - lo) * 0.09));
    };
    return {
      speed: mix("speed", 0.7, 1.6),
      size: mix("size", 0.82, 1.25),
      curiosity: mix("curiosity", 0.05, 1),
      sociability: mix("sociability", 0.05, 1),
      industry: mix("industry", 0.05, 1),
      hue: Math.max(-0.12, Math.min(0.12, mix("hue", -0.12, 0.12))),
      lifespan: mix("lifespan", 320, 760),
    };
  }

  spawn(
    x: number,
    z: number,
    genome: Genome,
    gen: number,
    parents: [number, number] | null,
    age = 0,
    parentNames: [string, string] | null = null,
  ): Thronglet {
    const t: Thronglet = {
      id: this.nextId++,
      name: makeName(this.rand),
      gen,
      parents,
      parentNames,
      x,
      z,
      y: this.terrain.height(x, z),
      vx: 0,
      vz: 0,
      heading: this.rand() * Math.PI * 2,
      age,
      stage: "baby",
      scale: 0.5,
      alive: true,
      hunger: range(this.rand, 0.1, 0.4),
      thirst: range(this.rand, 0.1, 0.4),
      energy: range(this.rand, 0, 0.25),
      social: range(this.rand, 0.1, 0.5),
      joy: range(this.rand, 0.1, 0.5),
      health: 1,
      genome,
      task: "wander",
      taskTimer: 0,
      thinkTimer: this.rand(),
      thought: "…",
      target: null,
      targetTree: null,
      targetSite: null,
      partner: null,
      mateCooldown: 30,
      stuck: 0,
      carryingWood: 0,
      blocksPlaced: 0,
      mealsEaten: 0,
      childCount: 0,
      memory: [],
      bob: this.rand() * 10,
      hop: 0,
      emote: null,
    };
    this.updateStage(t);
    this.thronglets.push(t);
    this.generation = Math.max(this.generation, gen);
    return t;
  }

  private updateStage(t: Thronglet) {
    const a = t.age;
    t.stage = a < 25 ? "baby" : a < 70 ? "child" : a < t.genome.lifespan * 0.75 ? "adult" : "elder";
    const growth =
      t.stage === "baby"
        ? 0.5 + (a / 25) * 0.22
        : t.stage === "child"
          ? 0.72 + ((a - 25) / 45) * 0.28
          : t.stage === "elder"
            ? 0.96
            : 1;
    t.scale = growth * t.genome.size;
  }

  addLog(text: string, kind: string) {
    this.log.push({ t: this.time, text, kind });
    if (this.log.length > 60) this.log.shift();
  }

  get isNight() {
    const p = (this.time / DAY_LENGTH) % 1;
    return p > 0.72 || p < 0.06;
  }

  get dayPhase() {
    return (this.time / DAY_LENGTH) % 1;
  }

  get tierIndex() {
    let i = 0;
    for (let k = 0; k < STRUCTURE_TIERS.length; k++) {
      if (this.knowledge >= STRUCTURE_TIERS[k].knowledge) i = k + 1;
    }
    return Math.min(i, TIER_NAMES.length - 1);
  }

  stats(): ColonyStats {
    return {
      population: this.thronglets.length,
      eggs: this.eggs.length,
      generation: this.generation,
      knowledge: this.knowledge,
      structures: this.sites.filter((s) => s.complete).length,
      births: this.births,
      deaths: this.deaths,
      blocks: this.sites.reduce((n, s) => n + s.placed, 0),
      tier: TIER_NAMES[this.tierIndex],
    };
  }

  /* ---------------- world queries ---------------- */

  private remember(t: Thronglet, x: number, z: number, kind: Memory["kind"]) {
    if (t.memory.some((m) => m.kind === kind && Math.hypot(m.x - x, m.z - z) < 4))
      return;
    t.memory.push({ x, z, kind });
    if (t.memory.length > 8) t.memory.shift();
  }

  nearestTreeWithFruit(t: Thronglet) {
    let best: Tree | null = null;
    let bestD = Infinity;
    for (const tr of this.trees) {
      if (tr.fruit <= 0) continue;
      const d = Math.hypot(tr.x - t.x, tr.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = tr;
      }
    }
    return best;
  }

  nearestTreeWithWood(t: Thronglet) {
    let best: Tree | null = null;
    let bestD = Infinity;
    for (const tr of this.trees) {
      if (tr.wood <= 4) continue;
      const d = Math.hypot(tr.x - t.x, tr.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = tr;
      }
    }
    return best;
  }

  nearestBushWithBerries(t: Thronglet) {
    let best: Bush | null = null;
    let bestD = Infinity;
    for (const b of this.bushes) {
      if (b.berries <= 0) continue;
      const d = Math.hypot(b.x - t.x, b.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  nearestWater(t: Thronglet) {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const p of this.terrain.ponds) {
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d - p.r < bestD) {
        bestD = d - p.r;
        // Aim for the rim, not the middle.
        const a = Math.atan2(t.z - p.z, t.x - p.x);
        best = { x: p.x + Math.cos(a) * (p.r + 0.6), z: p.z + Math.sin(a) * (p.r + 0.6) };
      }
    }
    for (const tub of this.tubs) {
      const d = Math.hypot(tub.x - t.x, tub.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = { x: tub.x + 1.2, z: tub.z + 0.9 };
      }
    }
    return best;
  }

  activeSite(): BuildSite | null {
    for (const s of this.sites) if (!s.complete) return s;
    return null;
  }

  nearbyFriend(t: Thronglet, radius: number): Thronglet | null {
    let best: Thronglet | null = null;
    let bestD = radius;
    for (const o of this.thronglets) {
      if (o === t || !o.alive) continue;
      const d = Math.hypot(o.x - t.x, o.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /* ---------------- planning ---------------- */

  private planSite() {
    const unlocked = STRUCTURE_TIERS.filter((s) => this.knowledge >= s.knowledge);
    if (!unlocked.length) return;
    const built = this.sites.filter((s) => s.complete);

    // Housing first — a colony that has outgrown its huts builds another one.
    // Otherwise pick among everything they know, leaning towards the newest
    // trick so the skyline keeps changing without becoming all monoliths.
    const huts = built.filter((s) => s.kind === "hut").length;
    let choice: (typeof STRUCTURE_TIERS)[number];
    if (this.knowledge >= 25 && huts * 8 < this.thronglets.length) {
      choice = STRUCTURE_TIERS[1];
    } else {
      const weights = unlocked.map((_, i) => (i === unlocked.length - 1 ? 3 : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = this.rand() * total;
      choice = unlocked[0];
      for (let i = 0; i < unlocked.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          choice = unlocked[i];
          break;
        }
      }
    }

    // Cluster around the existing village if there is one.
    const anchor = built.length
      ? built[Math.floor(this.rand() * built.length)]
      : this.thronglets[Math.floor(this.rand() * Math.max(1, this.thronglets.length))];
    const spot = findLandSpot(
      this.rand,
      this.terrain,
      anchor ? { x: anchor.x, z: anchor.z } : undefined,
      built.length ? 14 : 10,
    );
    if (this.sites.some((s) => Math.hypot(s.x - spot.x, s.z - spot.z) < 6)) return;
    if (this.trees.some((tr) => Math.hypot(tr.x - spot.x, tr.z - spot.z) < 2.5)) return;

    const site: BuildSite = {
      id: this.nextSiteId++,
      kind: choice.kind,
      x: spot.x,
      z: spot.z,
      y: this.terrain.height(spot.x, spot.z),
      blocks: layout(choice.kind, this.rand),
      placed: 0,
      wood: 0,
      woodNeeded: choice.wood,
      complete: false,
    };
    this.sites.push(site);
    this.addLog(`The throng starts a ${choice.label.toLowerCase()}.`, "build");
  }

  /* ---------------- main tick ---------------- */

  update(dt: number) {
    this.time += dt;

    this.rebuildGrid();
    this.updateFlora(dt);
    this.updateEggs(dt);

    for (const t of this.thronglets) this.updateThronglet(t, dt);

    // Reap the dead.
    for (let i = this.thronglets.length - 1; i >= 0; i--) {
      const t = this.thronglets[i];
      if (t.alive) continue;
      this.thronglets.splice(i, 1);
      this.deaths++;
      this.knowledge += 2; // what one learned, the throng keeps
      this.addLog(`${t.name} returns to the throng.`, "death");
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.drops[i].life -= dt;
      if (this.drops[i].life <= 0) this.drops.splice(i, 1);
    }

    // Knowledge accrues from population, buildings and the monolith.
    const monoliths = this.sites.filter(
      (s) => s.complete && s.kind === "monolith",
    ).length;
    const towers = this.sites.filter((s) => s.complete && s.kind === "tower").length;
    this.knowledge +=
      dt *
      (this.thronglets.length * 0.02 +
        this.sites.filter((s) => s.complete).length * 0.05 +
        towers * 0.15 +
        monoliths * 0.6);

    this.historyTimer -= dt;
    if (this.historyTimer <= 0) {
      this.historyTimer = 4;
      this.history.push(this.thronglets.length);
      if (this.history.length > 150) this.history.shift();
    }

    this.planCooldown -= dt;
    if (this.planCooldown <= 0) {
      this.planCooldown = 25;
      const pending = this.sites.filter((s) => !s.complete).length;
      if (pending < 1 + Math.floor(this.thronglets.length / 25)) this.planSite();
    }
  }

  /* ---------------- spatial index ---------------- */

  private static cellOf(x: number, z: number) {
    // One key per CELL x CELL patch of ground, offset so negatives stay positive.
    return (
      (Math.floor(x / CELL) + 4096) * 8192 + (Math.floor(z / CELL) + 4096)
    );
  }

  private rebuildGrid() {
    this.grid.clear();
    for (const t of this.thronglets) {
      const key = Colony.cellOf(t.x, t.z);
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(t);
      else this.grid.set(key, [t]);
    }
  }

  /** Everyone in the nine cells around a point — the only ones close enough to matter. */
  private eachNeighbour(t: Thronglet, fn: (other: Thronglet) => void) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.grid.get(
          Colony.cellOf(t.x + dx * CELL, t.z + dz * CELL),
        );
        if (!bucket) continue;
        for (const o of bucket) fn(o);
      }
  }

  private updateFlora(dt: number) {
    for (const tr of this.trees) {
      tr.regrow += dt;
      if (tr.regrow > 26 && tr.fruit < tr.capacity) {
        tr.regrow = 0;
        tr.fruit++;
      }
      if (tr.wood < 60) tr.wood += dt * 0.35;
    }
    for (const b of this.bushes) {
      b.regrow += dt;
      if (b.regrow > 34 && b.berries < 4) {
        b.regrow = 0;
        b.berries++;
      }
    }
  }

  private updateEggs(dt: number) {
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      e.timer -= dt;
      if (e.timer > 0) continue;
      this.eggs.splice(i, 1);
      if (this.thronglets.length >= POP_CAP) continue;
      const baby = this.spawn(
        e.x,
        e.z,
        e.genome,
        e.gen,
        e.parents,
        0,
        e.parentNames,
      );
      this.births++;
      this.addLog(
        `${baby.name} hatches, child of ${e.parentNames[0]} and ${e.parentNames[1]}.`,
        "birth",
      );
    }
  }

  /* ---------------- agent ---------------- */

  private updateThronglet(t: Thronglet, dt: number) {
    t.age += dt;
    this.updateStage(t);
    if (t.mateCooldown > 0) t.mateCooldown -= dt;
    if (t.emote) {
      t.emote.t -= dt;
      if (t.emote.t <= 0) t.emote = null;
    }

    const babyFactor = t.stage === "baby" ? 0.6 : 1;
    t.hunger = Math.min(1, t.hunger + dt * 0.011 * babyFactor);
    t.thirst = Math.min(1, t.thirst + dt * 0.015 * babyFactor);
    t.energy = Math.min(1, t.energy + dt * (this.isNight ? 0.016 : 0.006));
    t.social = Math.min(1, t.social + dt * 0.013 * t.genome.sociability);
    t.joy = Math.min(1, t.joy + dt * 0.009);

    if (t.hunger > 0.97 || t.thirst > 0.97) t.health -= dt * 0.06;
    else if (t.hunger < 0.5 && t.thirst < 0.5) t.health = Math.min(1, t.health + dt * 0.03);

    if (t.health <= 0 || t.age > t.genome.lifespan) {
      t.alive = false;
      return;
    }

    // If a goal has been unreachable for half a minute, give up on it and go
    // somewhere else — otherwise one bad target can starve a whole colony.
    t.stuck += dt;
    if (t.stuck > 30) {
      this.startTask(t, "wander");
      t.thought = "…this isn't working.";
    }

    t.thinkTimer -= dt;
    if (t.thinkTimer <= 0) {
      t.thinkTimer = range(this.rand, 0.6, 1.4);
      this.think(t);
    }

    this.act(t, dt);
    this.move(t, dt);
  }

  /** Utility scoring: every drive bids, the loudest one wins. */
  private think(t: Thronglet) {
    const g = t.genome;
    const scores: Record<string, number> = {
      eat: Math.pow(t.hunger, 2) * 1.9,
      drink: Math.pow(t.thirst, 2) * 2,
      sleep: Math.pow(t.energy, 2.4) * (this.isNight ? 1.15 : 0.5),
      socialize: Math.pow(t.social, 1.6) * 0.75 * g.sociability,
      play: Math.pow(t.joy, 1.8) * 0.7,
      wander: 0.1 + g.curiosity * 0.1,
    };

    // Work happens when nothing is pressing. Squaring the loudest need keeps a
    // half-full belly from stopping the build entirely, and tiredness is left
    // out on purpose: it bids for sleep on its own, and folding it in here
    // leaves nobody willing to work by mid-afternoon.
    const site = this.activeSite();
    const pressure = Math.max(t.hunger, t.thirst);
    const calm = Math.max(0, 1 - pressure * pressure);
    if (site && t.stage !== "baby") {
      const needsWood = site.wood < site.woodNeeded;
      scores.gather = needsWood ? 0.95 * g.industry * calm : 0;
      scores.build =
        site.wood > 0 && site.placed < site.blocks.length
          ? (t.carryingWood > 0 ? 1.1 : 0.9) * g.industry * calm
          : 0;
      if (t.carryingWood > 0) scores.build = Math.max(scores.build, 1.2 * calm);
    }

    if (
      t.stage === "adult" &&
      t.mateCooldown <= 0 &&
      t.hunger < 0.45 &&
      t.thirst < 0.5 &&
      this.thronglets.length + this.eggs.length < POP_CAP
    ) {
      // Crowding damps the urge to breed, so the population settles into an
      // S-curve instead of slamming into the cap and starving.
      const room = 1 - (this.thronglets.length + this.eggs.length) / POP_CAP;
      scores.mate = 0.55 * g.sociability * calm * Math.max(0.05, room);
    }

    let bestKey = "wander";
    let best = -1;
    for (const k of Object.keys(scores)) {
      if (scores[k] > best) {
        best = scores[k];
        bestKey = k;
      }
    }

    // Hysteresis: don't abandon a job for a marginally better one.
    const currentScore = scores[this.taskDrive(t.task)] ?? 0;
    if (t.task !== "idle" && currentScore > best * 0.82 && t.target) return;

    this.startTask(t, bestKey);
  }

  private taskDrive(task: Task): string {
    switch (task) {
      case "seekFood":
      case "eat":
        return "eat";
      case "seekWater":
      case "drink":
        return "drink";
      case "sleep":
        return "sleep";
      case "socialize":
        return "socialize";
      case "play":
        return "play";
      case "gather":
        return "gather";
      case "build":
        return "build";
      case "mate":
        return "mate";
      default:
        return "wander";
    }
  }

  private startTask(t: Thronglet, drive: string) {
    t.stuck = 0;
    t.targetTree = null;
    t.targetSite = null;
    t.partner = null;
    t.taskTimer = 0;

    switch (drive) {
      case "eat": {
        const drop = this.drops.length
          ? this.drops.reduce((a, b) =>
              Math.hypot(a.x - t.x, a.z - t.z) < Math.hypot(b.x - t.x, b.z - t.z)
                ? a
                : b,
            )
          : null;
        if (drop && Math.hypot(drop.x - t.x, drop.z - t.z) < 30) {
          t.task = "seekFood";
          t.target = { x: drop.x, z: drop.z };
          t.thought = "food fell from the sky!";
          return;
        }
        const tree = this.nearestTreeWithFruit(t);
        const bush = this.nearestBushWithBerries(t);
        const dt_ = tree ? Math.hypot(tree.x - t.x, tree.z - t.z) : Infinity;
        const db = bush ? Math.hypot(bush.x - t.x, bush.z - t.z) : Infinity;
        if (tree && dt_ <= db) {
          t.task = "seekFood";
          t.targetTree = tree.id;
          t.target = { x: tree.x + 0.9, z: tree.z + 0.6 };
          t.thought = "apples.";
          this.remember(t, tree.x, tree.z, "food");
        } else if (bush) {
          t.task = "seekFood";
          t.target = { x: bush.x + 0.6, z: bush.z + 0.4 };
          t.thought = "berries will do.";
          this.remember(t, bush.x, bush.z, "food");
        } else {
          this.startTask(t, "wander");
          t.thought = "hungry. nothing left here.";
        }
        return;
      }
      case "drink": {
        const w = this.nearestWater(t);
        if (w) {
          t.task = "seekWater";
          t.target = w;
          t.thought = "water.";
          this.remember(t, w.x, w.z, "water");
        } else this.startTask(t, "wander");
        return;
      }
      case "sleep": {
        // Curl up against the nearest hut wall — the walls are solid, so the
        // spot has to sit just outside the footprint or they can never arrive.
        const huts = this.sites.filter((s) => s.complete && s.kind === "hut");
        const hut = huts.length
          ? huts.reduce((a, b) =>
              Math.hypot(a.x - t.x, a.z - t.z) < Math.hypot(b.x - t.x, b.z - t.z)
                ? a
                : b,
            )
          : null;
        t.task = "sleep";
        if (hut) {
          const a = this.rand() * Math.PI * 2;
          const r = FOOTPRINT.hut + range(this.rand, 0.5, 1.1);
          t.target = { x: hut.x + Math.cos(a) * r, z: hut.z + Math.sin(a) * r };
        } else {
          t.target = { x: t.x, z: t.z };
        }
        t.thought = hut ? "warm by the wall." : "curling up here.";
        return;
      }
      case "socialize": {
        const friend = this.nearbyFriend(t, 22);
        if (friend) {
          t.task = "socialize";
          t.partner = friend.id;
          t.target = { x: friend.x, z: friend.z };
          t.thought = `find ${friend.name}.`;
        } else this.startTask(t, "wander");
        return;
      }
      case "play": {
        const tub = this.tubs.length
          ? this.tubs.reduce((a, b) =>
              Math.hypot(a.x - t.x, a.z - t.z) < Math.hypot(b.x - t.x, b.z - t.z) ? a : b,
            )
          : null;
        t.task = "play";
        t.target = tub
          ? { x: tub.x + range(this.rand, -1.6, 1.6), z: tub.z + range(this.rand, 1, 2.2) }
          : this.wanderTarget(t);
        t.thought = tub ? "splash time." : "spin in circles.";
        return;
      }
      case "gather": {
        const tree = this.nearestTreeWithWood(t);
        const site = this.activeSite();
        if (tree && site) {
          t.task = "gather";
          t.targetTree = tree.id;
          t.targetSite = site.id;
          t.target = { x: tree.x + 0.8, z: tree.z + 0.5 };
          t.thought = "wood for the build.";
        } else this.startTask(t, "wander");
        return;
      }
      case "build": {
        const site = this.activeSite();
        if (site) {
          t.task = "build";
          t.targetSite = site.id;
          t.target = {
            x: site.x + range(this.rand, -1.6, 1.6),
            z: site.z + range(this.rand, -1.6, 1.6),
          };
          t.thought = "stack it higher.";
        } else this.startTask(t, "wander");
        return;
      }
      case "mate": {
        const partner = this.thronglets.find(
          (o) =>
            o !== t &&
            o.alive &&
            o.stage === "adult" &&
            o.mateCooldown <= 0 &&
            o.hunger < 0.55 &&
            Math.hypot(o.x - t.x, o.z - t.z) < 25,
        );
        if (partner) {
          t.task = "mate";
          t.partner = partner.id;
          t.target = { x: partner.x, z: partner.z };
          t.thought = `${partner.name}?`;
        } else this.startTask(t, "wander");
        return;
      }
      default: {
        t.task = "wander";
        t.target = this.wanderTarget(t);
        t.thought = this.rand() < 0.3 ? "somewhere new." : "wander.";
      }
    }
  }

  private wanderTarget(t: Thronglet) {
    const curious = t.genome.curiosity;
    const spread = 5 + curious * 16;
    return findLandSpot(this.rand, this.terrain, { x: t.x, z: t.z }, spread);
  }

  private act(t: Thronglet, dt: number) {
    const atTarget =
      t.target && Math.hypot(t.target.x - t.x, t.target.z - t.z) < 0.85;

    switch (t.task) {
      case "seekFood": {
        if (!atTarget) return;
        const drop = this.drops.findIndex(
          (d) => Math.hypot(d.x - t.x, d.z - t.z) < 1.4,
        );
        if (drop >= 0) {
          this.drops.splice(drop, 1);
          this.feed(t, 0.75);
          return;
        }
        const tree = this.trees.find((tr) => tr.id === t.targetTree);
        if (tree && tree.fruit > 0) {
          tree.fruit--;
          this.feed(t, 0.6);
          return;
        }
        const bush = this.bushes.find(
          (b) => Math.hypot(b.x - t.x, b.z - t.z) < 1.8 && b.berries > 0,
        );
        if (bush) {
          bush.berries--;
          this.feed(t, 0.32);
          return;
        }
        t.task = "idle";
        t.thinkTimer = 0;
        return;
      }
      case "seekWater": {
        if (!atTarget) return;
        t.task = "drink";
        t.taskTimer = 2.2;
        t.thought = "*slurp*";
        return;
      }
      case "drink": {
        t.taskTimer -= dt;
        t.thirst = Math.max(0, t.thirst - dt * 0.5);
        if (t.taskTimer <= 0) {
          t.emote = { icon: "droplet", t: 1.6 };
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "sleep": {
        if (!atTarget) return;
        t.energy = Math.max(0, t.energy - dt * 0.055);
        t.health = Math.min(1, t.health + dt * 0.01);
        t.thought = "zzz";
        if (t.energy <= 0.03) {
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "socialize": {
        const p = this.thronglets.find((o) => o.id === t.partner);
        if (!p || !p.alive) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.target = { x: p.x + 0.9, z: p.z + 0.6 };
        if (Math.hypot(p.x - t.x, p.z - t.z) > 1.7) return;
        t.social = Math.max(0, t.social - dt * 0.42);
        p.social = Math.max(0, p.social - dt * 0.3);
        t.joy = Math.max(0, t.joy - dt * 0.12);
        this.knowledge += dt * 0.06;
        t.taskTimer += dt;
        if (t.taskTimer > 2) {
          t.emote = { icon: "heart", t: 1.5 };
          // Chatter spreads what each of them knows.
          for (const m of p.memory) this.remember(t, m.x, m.z, m.kind);
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "play": {
        if (!atTarget) return;
        t.joy = Math.max(0, t.joy - dt * 0.4);
        t.energy = Math.min(1, t.energy + dt * 0.02);
        t.hop = Math.max(t.hop, 1);
        t.taskTimer += dt;
        if (t.taskTimer > 4) {
          t.emote = { icon: "spark", t: 1.4 };
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "gather": {
        const site = this.sites.find((s) => s.id === t.targetSite);
        if (!site || site.complete) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        if (t.carryingWood > 0) {
          t.target = { x: site.x + 0.8, z: site.z + 0.8 };
          if (Math.hypot(site.x - t.x, site.z - t.z) < 2.2) {
            site.wood += t.carryingWood;
            t.carryingWood = 0;
            t.emote = { icon: "wood", t: 1.2 };
            t.task = "build";
            t.thinkTimer = 0.4;
          }
          return;
        }
        const tree = this.trees.find((tr) => tr.id === t.targetTree);
        if (!tree || tree.wood <= 4) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.target = { x: tree.x + 0.8, z: tree.z + 0.5 };
        if (Math.hypot(tree.x - t.x, tree.z - t.z) > 1.7) return;
        t.taskTimer += dt;
        t.hop = Math.max(t.hop, 0.6);
        if (t.taskTimer > 2.4) {
          const take = Math.min(9, Math.floor(tree.wood));
          tree.wood -= take;
          t.carryingWood = take;
          t.taskTimer = 0;
          t.thought = "carrying wood.";
        }
        return;
      }
      case "build": {
        const site = this.sites.find((s) => s.id === t.targetSite) ?? this.activeSite();
        if (!site || site.complete) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.targetSite = site.id;
        if (Math.hypot(site.x - t.x, site.z - t.z) > 2.6) {
          t.target = { x: site.x + range(this.rand, -1.8, 1.8), z: site.z + range(this.rand, -1.8, 1.8) };
          return;
        }
        if (t.carryingWood > 0) {
          site.wood += t.carryingWood;
          t.carryingWood = 0;
        }
        if (site.wood <= 0 || site.placed >= site.blocks.length) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.taskTimer += dt;
        t.hop = Math.max(t.hop, 0.8);
        if (t.taskTimer > 0.9) {
          t.taskTimer = 0;
          site.placed++;
          site.wood -= 1;
          t.blocksPlaced++;
          this.knowledge += 0.4;
          if (site.placed >= site.blocks.length) {
            site.complete = true;
            this.knowledge += 12;
            this.addLog(
              `${t.name} sets the last block on the ${site.kind}.`,
              "built",
            );
          }
        }
        return;
      }
      case "mate": {
        const p = this.thronglets.find((o) => o.id === t.partner);
        if (!p || !p.alive || p.stage !== "adult") {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.target = { x: p.x + 0.8, z: p.z + 0.5 };
        if (Math.hypot(p.x - t.x, p.z - t.z) > 1.6) return;
        t.taskTimer += dt;
        if (t.taskTimer > 2.5) {
          t.mateCooldown = range(this.rand, 70, 120);
          p.mateCooldown = t.mateCooldown;
          t.childCount++;
          p.childCount++;
          t.emote = { icon: "heart", t: 2 };
          if (this.thronglets.length + this.eggs.length < POP_CAP) {
            const gen = Math.max(t.gen, p.gen) + 1;
            this.eggs.push({
              id: this.nextId++,
              x: t.x + range(this.rand, -0.7, 0.7),
              z: t.z + range(this.rand, -0.7, 0.7),
              y: this.terrain.height(t.x, t.z),
              timer: range(this.rand, 18, 28),
              genome: this.mixGenome(t.genome, p.genome),
              parents: [t.id, p.id],
              parentNames: [t.name, p.name],
              gen,
            });
            this.generation = Math.max(this.generation, gen);
          }
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      default: {
        if (atTarget || !t.target) {
          t.task = "idle";
          t.thinkTimer = Math.min(t.thinkTimer, 0.2);
        }
      }
    }
  }

  private feed(t: Thronglet, amount: number) {
    t.hunger = Math.max(0, t.hunger - amount);
    t.joy = Math.max(0, t.joy - amount * 0.25);
    t.mealsEaten++;
    t.emote = { icon: "apple", t: 1.5 };
    t.task = "idle";
    t.thinkTimer = 0.3;
    t.thought = "mm.";
  }

  private move(t: Thronglet, dt: number) {
    const sleeping = t.task === "sleep";
    const speedBase =
      (t.stage === "baby" ? 1.5 : t.stage === "elder" ? 1.7 : 2.3) *
      t.genome.speed;
    const speed = sleeping ? 0 : speedBase;

    if (t.target && !sleeping) {
      let dx = t.target.x - t.x;
      let dz = t.target.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;

      // Steer away from deep water and off the island rim.
      const ahead = 1.4;
      if (this.terrain.height(t.x + dx * ahead, t.z + dz * ahead) < WATER_LEVEL + 0.15) {
        const a = Math.atan2(dz, dx) + Math.PI * 0.45;
        dx = Math.cos(a);
        dz = Math.sin(a);
      }
      const rim = Math.hypot(t.x, t.z);
      if (rim > WORLD_RADIUS * 0.93) {
        dx -= (t.x / rim) * 1.4;
        dz -= (t.z / rim) * 1.4;
      }

      // Walls are solid — steer around anything that has been built up.
      for (const site of this.sites) {
        if (site.placed < 6) continue;
        const sx = t.x - site.x;
        const sz = t.z - site.z;
        const sd = Math.hypot(sx, sz);
        const radius = FOOTPRINT[site.kind];
        if (sd < radius && sd > 0.001) {
          const push = (radius - sd) / radius;
          dx += (sx / sd) * push * 2.6;
          dz += (sz / sd) * push * 2.6;
        }
      }

      // Gentle separation so crowds don't stack into one pixel.
      this.eachNeighbour(t, (o) => {
        if (o === t) return;
        const ox = t.x - o.x;
        const oz = t.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.001 && od < 0.75) {
          dx += (ox / od) * 0.9;
          dz += (oz / od) * 0.9;
        }
      });

      const n = Math.hypot(dx, dz) || 1;
      t.vx += ((dx / n) * speed - t.vx) * Math.min(1, dt * 6);
      t.vz += ((dz / n) * speed - t.vz) * Math.min(1, dt * 6);
    } else {
      t.vx *= Math.max(0, 1 - dt * 5);
      t.vz *= Math.max(0, 1 - dt * 5);
    }

    t.x += t.vx * dt;
    t.z += t.vz * dt;
    t.y = this.terrain.height(t.x, t.z);

    const moving = Math.hypot(t.vx, t.vz);
    if (moving > 0.05) t.heading = Math.atan2(t.vx, t.vz);
    t.bob += dt * (3.5 + moving * 2.4);
    t.hop = Math.max(0, t.hop - dt * 1.6);
    t.energy = Math.min(1, t.energy + moving * dt * 0.004);
  }

  /* ---------------- player interaction ---------------- */

  dropFood(x: number, z: number) {
    const y = this.terrain.height(x, z);
    if (y < WATER_LEVEL) return false;
    this.drops.push({ x, z, y, life: 90 });
    for (const t of this.thronglets) {
      if (Math.hypot(t.x - x, t.z - z) < 18 && t.hunger > 0.25) {
        t.thinkTimer = Math.min(t.thinkTimer, 0.15);
      }
    }
    return true;
  }

  pet(t: Thronglet) {
    t.joy = Math.max(0, t.joy - 0.5);
    t.social = Math.max(0, t.social - 0.3);
    t.emote = { icon: "heart", t: 2 };
    t.hop = 1.2;
    this.knowledge += 0.5;
  }

  plantTree(x: number, z: number) {
    const y = this.terrain.height(x, z);
    if (y < WATER_LEVEL + 0.4) return false;
    const id = (this.trees[this.trees.length - 1]?.id ?? 0) + 1;
    const capacity = 4;
    const fruitSlots = fruitSlotsFor(this.rand, capacity, 0.9);
    this.trees.push({
      id,
      x,
      z,
      y,
      scale: 0.9,
      rot: this.rand() * Math.PI * 2,
      fruit: 2,
      capacity,
      regrow: 0,
      wood: 45,
      fruitSlots,
    });
    return true;
  }
}
