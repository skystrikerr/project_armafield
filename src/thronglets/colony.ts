import { gauss, mulberry32, pick, range, type Rand } from "./random";
import {
  adjustRelation,
  atWar,
  driftRelations,
  makeClan,
  makeFaith,
  relationOf,
  splinterFaith,
  type Clan,
  type Faith,
} from "./clans";
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
  shrine: 1.2,
  farm: 0,
  tower: 1.0,
  monolith: 1.2,
};
export const DAY_LENGTH = 150; // sim seconds for a full day/night cycle
export const POP_CAP = 220;

/** A clan this big starts looking for reasons to split. */
const SCHISM_SIZE = 30;
/** Past this many living clans the island stops splintering further. */
const MAX_CLANS = 6;
/** Villages are kept at least this far apart. */
const VILLAGE_SPACING = 26;

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
  | "mate"
  | "worship"
  | "raid"
  | "flee";

export type Genome = {
  speed: number;
  size: number;
  curiosity: number;
  sociability: number;
  industry: number;
  /** Willingness to raise a hand to someone from another clan. */
  aggression: number;
  /** How readily this one takes the clan's god to heart. */
  devotion: number;
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
  /** Family line, inherited from a parent — the surname under the clan. */
  family: string;
  clanId: number;

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
  /** Unmet devotion — rises until they get to a shrine. */
  spirit: number;
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
  kills: number;
  /** Who they are swinging at, and how long since the last blow landed. */
  foe: number | null;
  combatTimer: number;
  hurt: number;
  /** Killed in a raid rather than by age or hunger — changes the eulogy. */
  slain: boolean;

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
  family: string;
  clanId: number;
  gen: number;
};

export type Block = { x: number; y: number; z: number; color: number };

export type StructureKind =
  | "cairn"
  | "hut"
  | "shrine"
  | "farm"
  | "tower"
  | "monolith";

export type BuildSite = {
  id: number;
  clanId: number;
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
  clans: number;
  faiths: number;
  wars: number;
  killed: number;
  converted: number;
  skirmishes: number;
};

export type ClanReport = {
  id: number;
  name: string;
  color: number;
  members: number;
  deity: string;
  creed: string;
  sacred: string;
  zeal: number;
  heresy: boolean;
  home: { x: number; z: number };
  raids: number;
  losses: number;
  standings: { id: number; name: string; value: number }[];
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
  { kind: "shrine", label: "Shrine", knowledge: 55, wood: 80 },
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

function layout(kind: StructureKind, rand: Rand, accent: number): Block[] {
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
  } else if (kind === "shrine") {
    // A stepped platform with the clan's colour on top — the thing they walk
    // to at dawn, and the first thing a raiding party goes for.
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) push(x, 0, z, (x + z) % 2 === 0 ? stone : stoneDark);
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) push(x, 1, z, stone);
    for (const [x, z] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ] as [number, number][]) {
      push(x, 1, z, woodDark);
      push(x, 2, z, wood);
      push(x, 3, z, accent);
    }
    push(0, 2, 0, stoneDark);
    push(0, 3, 0, accent);
    push(0, 4, 0, accent);
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
  clans: Clan[] = [];
  faiths: Faith[] = [];

  time = DAY_LENGTH * 0.18; // start mid-morning
  /** Population sampled over time, for the chart in the HUD. */
  history: number[] = [];
  private historyTimer = 0;
  knowledge = 0;
  births = 0;
  deaths = 0;
  killed = 0;
  converted = 0;
  skirmishes = 0;
  generation = 1;
  log: LogEntry[] = [];

  /** Agents bucketed by cell, rebuilt each tick so crowd checks stay local. */
  private grid = new Map<number, Thronglet[]>();
  private nextId = 1;
  private nextSiteId = 1;
  private nextClanId = 1;
  private nextFaithId = 1;
  private planCooldown = 6;
  private schismCooldown = 60;
  private contactTimer = 0;
  private wars = new Set<string>();

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

    const start = this.newVillageSpot();
    const first = this.foundClan(start);
    for (let i = 0; i < 10; i++) {
      const spot = findLandSpot(this.rand, this.terrain, start, 7);
      this.spawn(
        spot.x,
        spot.z,
        this.randomGenome(),
        1,
        null,
        i < 5 ? 40 : 12,
        null,
        makeName(this.rand),
        first.id,
      );
    }
    this.addLog(
      `Ten thronglets blink awake and call themselves the ${first.name}.`,
      "spawn",
    );
    this.addLog(
      `The ${first.name} name their god ${first.faith.deity}: "${first.faith.creed}"`,
      "faith",
    );
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
      aggression: range(r, 0.05, 0.7),
      devotion: range(r, 0.1, 0.9),
      hue: range(r, -0.05, 0.05),
      lifespan: range(r, 540, 820),
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
      aggression: mix("aggression", 0.02, 1),
      devotion: mix("devotion", 0.02, 1),
      hue: Math.max(-0.12, Math.min(0.12, mix("hue", -0.12, 0.12))),
      lifespan: mix("lifespan", 460, 900),
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
    family = makeName(this.rand),
    clanId = this.clans[0]?.id ?? 1,
  ): Thronglet {
    const t: Thronglet = {
      id: this.nextId++,
      name: makeName(this.rand),
      gen,
      parents,
      parentNames,
      family,
      clanId,
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
      spirit: range(this.rand, 0.1, 0.4),
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
      mateCooldown: 18,
      stuck: 0,
      carryingWood: 0,
      blocksPlaced: 0,
      mealsEaten: 0,
      childCount: 0,
      kills: 0,
      foe: null,
      combatTimer: 0,
      hurt: 0,
      slain: false,
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

  /* ---------------- clans and faith ---------------- */

  clanOf(t: Thronglet): Clan {
    return this.clans.find((c) => c.id === t.clanId) ?? this.clans[0];
  }

  /** The clan's finished shrine, if they have got one up yet. */
  shrineOf(clan: Clan): BuildSite | null {
    return (
      this.sites.find(
        (s) => s.complete && s.kind === "shrine" && s.clanId === clan.id,
      ) ?? null
    );
  }

  private foundClan(
    home: { x: number; z: number },
    faith?: Faith,
  ): Clan {
    const f = faith ?? makeFaith(this.rand, this.nextFaithId++);
    if (!this.faiths.some((x) => x.id === f.id)) this.faiths.push(f);
    let clan = makeClan(this.rand, this.nextClanId++, home, f, this.time);
    // Two villages with the same name would be unreadable in the log.
    for (let i = 0; i < 20 && this.clans.some((c) => c.name === clan.name); i++) {
      clan = makeClan(this.rand, clan.id, home, f, this.time);
    }
    for (const other of this.clans) {
      // A new people starts out merely unknown, unless it left in anger.
      adjustRelation(clan, other, f.heresyOf === other.faith.id ? -0.45 : 0);
    }
    this.clans.push(clan);
    return clan;
  }

  /**
   * Somewhere far enough from every existing village to be its own place, and
   * close enough to water and trees to survive there. Settling a clan on a dry
   * hill is a slow death sentence for it.
   */
  private newVillageSpot(near?: { x: number; z: number }) {
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 200; i++) {
      const spot = findLandSpot(this.rand, this.terrain, near, WORLD_RADIUS * 0.85);
      const spacing = this.clans.length
        ? Math.min(
            ...this.clans.map((c) =>
              Math.hypot(c.home.x - spot.x, c.home.z - spot.z),
            ),
          )
        : Infinity;
      if (spacing < VILLAGE_SPACING) continue;

      const water = Math.min(
        ...this.terrain.ponds.map(
          (p) => Math.max(0, Math.hypot(p.x - spot.x, p.z - spot.z) - p.r),
        ),
        60,
      );
      const wood = this.trees.length
        ? Math.min(
            ...this.trees.map((t) => Math.hypot(t.x - spot.x, t.z - spot.z)),
          )
        : 60;

      const score = -water * 1.6 - wood * 0.5 + Math.min(spacing, 40) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = spot;
      }
      if (water < 12 && wood < 8) return spot;
    }
    return best ?? findLandSpot(this.rand, this.terrain);
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

  /** First light and last light — when the faithful gather at the shrine. */
  get isRitualHour() {
    const p = this.dayPhase;
    return p < 0.14 || (p > 0.6 && p < 0.72);
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
      clans: this.clans.filter((c) => c.members > 0).length,
      faiths: new Set(
        this.clans.filter((c) => c.members > 0).map((c) => c.faith.id),
      ).size,
      wars: this.wars.size,
      killed: this.killed,
      converted: this.converted,
      skirmishes: this.skirmishes,
    };
  }

  /** Everything the HUD needs to draw the peoples panel. */
  clanReports(): ClanReport[] {
    return this.clans
      .filter((c) => c.members > 0)
      .sort((a, b) => b.members - a.members)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        members: c.members,
        deity: c.faith.deity,
        creed: c.faith.creed,
        sacred: c.faith.sacred,
        zeal: c.faith.zeal,
        heresy: c.faith.heresyOf !== null,
        home: c.home,
        raids: c.raids,
        losses: c.losses,
        standings: this.clans
          .filter((o) => o.id !== c.id && o.members > 0)
          .map((o) => ({ id: o.id, name: o.name, value: relationOf(c, o) })),
      }));
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

  /**
   * Each clan builds its own village, laid out in rings around the spot it
   * settled, so a place grows outward instead of scattering huts over the map.
   */
  private planSite() {
    for (const clan of this.clans) {
      if (clan.members < 3) continue;
      const pending = this.sites.filter(
        (s) => !s.complete && s.clanId === clan.id,
      ).length;
      if (pending >= 2 + Math.floor(clan.members / 10)) continue;

      const choice = this.chooseStructure(clan);
      if (!choice) continue;
      const spot = this.villagePlot(clan, choice.kind);
      if (!spot) continue;

      this.sites.push({
        id: this.nextSiteId++,
        clanId: clan.id,
        kind: choice.kind,
        x: spot.x,
        z: spot.z,
        y: this.terrain.height(spot.x, spot.z),
        blocks: layout(choice.kind, this.rand, clan.color),
        placed: 0,
        wood: 0,
        woodNeeded: choice.wood,
        complete: false,
      });
      this.addLog(
        `The ${clan.name} start a ${choice.label.toLowerCase()}.`,
        "build",
      );
    }
  }

  private chooseStructure(clan: Clan) {
    const unlocked = STRUCTURE_TIERS.filter((s) => this.knowledge >= s.knowledge);
    if (!unlocked.length) return null;
    const built = this.sites.filter((s) => s.complete && s.clanId === clan.id);

    // A people wants somewhere to pray and somewhere to sleep before it wants
    // a monument.
    const shrine = STRUCTURE_TIERS.find((t) => t.kind === "shrine")!;
    if (
      this.knowledge >= shrine.knowledge &&
      !built.some((s) => s.kind === "shrine") &&
      !this.sites.some((s) => s.clanId === clan.id && s.kind === "shrine")
    )
      return shrine;

    const hut = STRUCTURE_TIERS.find((t) => t.kind === "hut")!;
    const huts = built.filter((s) => s.kind === "hut").length;
    if (this.knowledge >= hut.knowledge && huts * 4 < clan.members) return hut;

    const weights = unlocked.map((_, i) => (i === unlocked.length - 1 ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.rand() * total;
    for (let i = 0; i < unlocked.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return unlocked[i];
    }
    return unlocked[0];
  }

  private villagePlot(clan: Clan, kind: StructureKind) {
    const clear = (x: number, z: number, gap: number) =>
      Math.hypot(x, z) < WORLD_RADIUS * 0.93 &&
      this.terrain.height(x, z) >= WATER_LEVEL + 0.6 &&
      !this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < gap) &&
      !this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5);

    // The shrine takes the middle of the village; everything else rings it.
    if (kind === "shrine" && clear(clan.home.x, clan.home.z, 4.5))
      return { x: clan.home.x, z: clan.home.z };

    for (let attempt = 0; attempt < 90; attempt++) {
      const ring = 1 + Math.floor(attempt / 18);
      const radius = 4.6 + ring * 3.4 + this.rand() * 1.6;
      const a = this.rand() * Math.PI * 2;
      const x = clan.home.x + Math.cos(a) * radius;
      const z = clan.home.z + Math.sin(a) * radius;
      if (clear(x, z, 5.2)) return { x, z };
    }
    return null;
  }

  /* ---------------- main tick ---------------- */

  update(dt: number) {
    this.time += dt;

    this.rebuildGrid();
    this.countClans();
    driftRelations(this.clans, dt);
    this.updateWars(dt);
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
      if (!t.slain) this.addLog(`${t.name} returns to the throng.`, "death");
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
      this.planCooldown = 18;
      this.planSite();
    }

    this.contactTimer -= dt;
    if (this.contactTimer <= 0) {
      this.contactTimer = 2;
      this.crossClanContact();
    }

    this.schismCooldown -= dt;
    if (this.schismCooldown <= 0) {
      this.schismCooldown = 50;
      this.maybeSchism();
    }
  }

  /* ---------------- peoples ---------------- */

  private countClans() {
    for (const c of this.clans) c.members = 0;
    for (const t of this.thronglets) {
      const c = this.clanOf(t);
      if (c) c.members++;
    }
  }

  /** Declarations, peace, and the weariness that eventually ends a feud. */
  private updateWars(dt: number) {
    const live = this.clans.filter((c) => c.members > 0);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
        const warring = atWar(a, b);

        if (warring && !this.wars.has(key)) {
          this.wars.add(key);
          // A declaration commits both sides: without this the feud flickers
          // back to peace before any raiding party has walked there.
          adjustRelation(a, b, -0.15);
          this.addLog(
            `The ${a.name} and the ${b.name} take up stones over ${a.faith.deity} and ${b.faith.deity}.`,
            "war",
          );
        } else if (!warring && this.wars.has(key)) {
          this.wars.delete(key);
          this.addLog(`The ${a.name} and the ${b.name} put the stones down.`, "peace");
        }

        // Grief is the only thing that reliably ends a war.
        if (warring) {
          const grief = Math.min(1, (a.losses + b.losses) / 6);
          adjustRelation(a, b, (0.02 + grief * 0.06) * dt);
        }
      }
    }
  }

  /**
   * A clan that grows past a certain size stops agreeing with itself. The most
   * devout member walks out with whoever is standing nearby and founds a new
   * village around a sharper version of the old god.
   */
  private maybeSchism() {
    if (this.clans.filter((c) => c.members > 0).length >= MAX_CLANS) return;
    for (const clan of this.clans) {
      if (clan.members < SCHISM_SIZE) continue;
      if (this.rand() > 0.35) continue;

      const members = this.thronglets.filter(
        (t) => t.clanId === clan.id && t.stage !== "baby",
      );
      if (members.length < 6) continue;

      const prophet = members.reduce((a, b) =>
        a.genome.devotion > b.genome.devotion ? a : b,
      );
      const home = this.newVillageSpot(prophet);
      const faith = splinterFaith(this.rand, this.nextFaithId++, clan.faith);
      const splinter = this.foundClan(home, faith);

      const followers = members
        .filter((t) => t !== prophet)
        .sort(
          (a, b) =>
            Math.hypot(a.x - prophet.x, a.z - prophet.z) -
            Math.hypot(b.x - prophet.x, b.z - prophet.z),
        )
        .slice(0, Math.max(3, Math.floor(members.length * 0.35)));

      prophet.clanId = splinter.id;
      for (const f of followers) f.clanId = splinter.id;
      splinter.members = followers.length + 1;

      this.addLog(
        `${prophet.name} walks out with ${followers.length} others and founds the ${splinter.name}.`,
        "schism",
      );
      this.addLog(
        `The ${splinter.name} give their god the name ${faith.deity}: "${faith.creed}"`,
        "faith",
      );
      return;
    }
  }

  /**
   * Wherever two clans are standing close enough to talk, one of them may end
   * up carrying the other's god home. This runs on proximity rather than on
   * anyone choosing to preach, which is what makes faith actually spread.
   */
  private crossClanContact() {
    for (const t of this.thronglets) {
      if (t.stage === "baby" || t.task === "raid" || t.task === "flee") continue;
      if (this.rand() > 0.25) continue;
      let met: Thronglet | null = null;
      this.eachNeighbour(t, (o) => {
        if (met || o === t || o.clanId === t.clanId || o.stage === "baby") return;
        if (Math.hypot(o.x - t.x, o.z - t.z) < 1.9) met = o;
      });
      if (met) this.maybeConvert(t, met);
    }
  }

  /** Nearest living member of a clan we are at war with. */
  nearestEnemy(t: Thronglet, radius: number): Thronglet | null {
    const clan = this.clanOf(t);
    if (!clan) return null;
    let best: Thronglet | null = null;
    let bestD = radius;
    for (const o of this.thronglets) {
      if (o.clanId === t.clanId || !o.alive || o.stage === "baby") continue;
      const other = this.clanOf(o);
      if (!other || !atWar(clan, other)) continue;
      const d = Math.hypot(o.x - t.x, o.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
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
        e.family,
        e.clanId,
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
    t.thirst = Math.min(1, t.thirst + dt * 0.012 * babyFactor);
    t.energy = Math.min(1, t.energy + dt * (this.isNight ? 0.016 : 0.006));
    t.social = Math.min(1, t.social + dt * 0.013 * t.genome.sociability);
    t.joy = Math.min(1, t.joy + dt * 0.009);
    t.spirit = Math.min(1, t.spirit + dt * 0.008 * (0.4 + t.genome.devotion));
    if (t.hurt > 0) t.hurt = Math.max(0, t.hurt - dt * 1.6);
    if (t.combatTimer > 0) t.combatTimer -= dt;

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

    const clan = this.clanOf(t);
    if (clan) {
      // Devotion only bids once there is somewhere to take it.
      const shrine = this.shrineOf(clan);
      scores.worship = shrine
        ? Math.pow(t.spirit, 1.7) *
          (0.55 + g.devotion) *
          (this.isRitualHour ? 1.9 : 0.8)
        : 0;

      // Raiding: only adults, only in a war, and only while they can stand.
      const warring = this.clans.some(
        (o) => o.members > 0 && o.id !== clan.id && atWar(clan, o),
      );
      if (
        warring &&
        t.stage === "adult" &&
        t.health > 0.6 &&
        g.aggression > 0.45
      ) {
        const enemy = this.nearestEnemy(t, 34);
        scores.raid =
          0.55 *
          (0.2 + g.aggression) *
          (0.4 + clan.faith.zeal * 0.7) *
          (enemy ? 1.15 : 0.5) *
          Math.max(0, 1 - Math.max(t.hunger, t.thirst));
      }
    }

    // Being badly hurt overrides everything else.
    if (t.health < 0.5) scores.flee = 2.2;

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
      scores.mate = 1.25 * (0.5 + g.sociability) * calm * Math.max(0.05, room);
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
      case "worship":
        return "worship";
      case "raid":
        return "raid";
      case "flee":
        return "flee";
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
        // The devout will walk a long way to talk to somebody who worships
        // the wrong thing.
        const clan = this.clanOf(t);
        if (
          clan &&
          t.stage === "adult" &&
          t.genome.devotion * clan.faith.zeal > 0.4 &&
          this.rand() < 0.35
        ) {
          const stranger = this.thronglets.find(
            (o) =>
              o.clanId !== t.clanId &&
              o.alive &&
              o.stage !== "baby" &&
              Math.hypot(o.x - t.x, o.z - t.z) < 60 &&
              !atWar(clan, this.clanOf(o)),
          );
          if (stranger) {
            t.task = "socialize";
            t.partner = stranger.id;
            t.target = { x: stranger.x, z: stranger.z };
            t.thought = `${stranger.name} has not heard of ${clan.faith.deity}.`;
            return;
          }
        }

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
            Math.hypot(o.x - t.x, o.z - t.z) < 34,
        );
        if (partner) {
          t.task = "mate";
          t.partner = partner.id;
          t.target = { x: partner.x, z: partner.z };
          t.thought = `${partner.name}?`;
        } else this.startTask(t, "wander");
        return;
      }
      case "worship": {
        const clan = this.clanOf(t);
        const shrine = clan ? this.shrineOf(clan) : null;
        if (!shrine) {
          this.startTask(t, "wander");
          return;
        }
        const a = this.rand() * Math.PI * 2;
        const r = FOOTPRINT.shrine + range(this.rand, 0.4, 1.3);
        t.task = "worship";
        t.target = { x: shrine.x + Math.cos(a) * r, z: shrine.z + Math.sin(a) * r };
        t.thought = `${clan!.faith.deity} is watching.`;
        return;
      }
      case "raid": {
        const clan = this.clanOf(t);
        const enemy = this.nearestEnemy(t, 40);
        if (enemy) {
          t.task = "raid";
          t.foe = enemy.id;
          t.target = { x: enemy.x, z: enemy.z };
          t.thought = `${enemy.name} is not one of ours.`;
          return;
        }
        // Nobody in reach — march on the nearest hostile village instead.
        const rival = this.clans
          .filter((o) => o.members > 0 && clan && o.id !== clan.id && atWar(clan, o))
          .sort(
            (a, b) =>
              Math.hypot(a.home.x - t.x, a.home.z - t.z) -
              Math.hypot(b.home.x - t.x, b.home.z - t.z),
          )[0];
        if (rival) {
          t.task = "raid";
          t.foe = null;
          t.target = {
            x: rival.home.x + range(this.rand, -2, 2),
            z: rival.home.z + range(this.rand, -2, 2),
          };
          t.thought = `march on the ${rival.name}.`;
        } else this.startTask(t, "wander");
        return;
      }
      case "flee": {
        const clan = this.clanOf(t);
        t.task = "flee";
        t.foe = null;
        t.target = clan
          ? { x: clan.home.x + range(this.rand, -3, 3), z: clan.home.z + range(this.rand, -3, 3) }
          : this.wanderTarget(t);
        t.thought = "get away. get home.";
        return;
      }
      default: {
        t.task = "wander";
        t.target = this.wanderTarget(t);
        t.thought = this.rand() < 0.3 ? "somewhere new." : "wander.";
      }
    }
  }

  /**
   * Villagers, not nomads: most wandering circles the clan's own village, and
   * only the curious strike out. Without this the colony diffuses across the
   * island, stops running into each other, and quietly stops breeding.
   */
  private wanderTarget(t: Thronglet) {
    const clan = this.clanOf(t);
    const curious = t.genome.curiosity;

    // The very devout occasionally set out for somebody else's village.
    if (
      clan &&
      t.stage === "adult" &&
      t.genome.devotion * clan.faith.zeal > 0.45 &&
      this.rand() < 0.18
    ) {
      const others = this.clans.filter(
        (c) => c.members > 0 && c.id !== clan.id && !atWar(clan, c),
      );
      if (others.length) {
        const target = pick(this.rand, others);
        t.thought = `carry ${clan.faith.deity} to the ${target.name}.`;
        return findLandSpot(this.rand, this.terrain, target.home, 6);
      }
    }

    if (clan && this.rand() > curious * 0.55) {
      return findLandSpot(this.rand, this.terrain, clan.home, 9 + curious * 6);
    }
    const spread = 6 + curious * 18;
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
          if (p.clanId !== t.clanId) this.maybeConvert(t, p);
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
          t.mateCooldown = range(this.rand, 40, 75);
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
              timer: range(this.rand, 13, 20),
              genome: this.mixGenome(t.genome, p.genome),
              parents: [t.id, p.id],
              parentNames: [t.name, p.name],
              family: this.rand() < 0.5 ? t.family : p.family,
              clanId: t.clanId,
              gen,
            });
            this.generation = Math.max(this.generation, gen);
          }
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "worship": {
        if (!atTarget) return;
        const clan = this.clanOf(t);
        t.spirit = Math.max(0, t.spirit - dt * 0.35);
        t.joy = Math.max(0, t.joy - dt * 0.05);
        t.taskTimer += dt;
        this.knowledge += dt * 0.05;
        t.thought = `${clan?.faith.deity ?? "something"}, hold us.`;
        if (t.taskTimer > 3.5) {
          t.emote = { icon: "faith", t: 1.6 };
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "raid": {
        const clan = this.clanOf(t);
        if (!clan) {
          t.task = "idle";
          return;
        }
        const foe = this.nearestEnemy(t, 1.5);
        if (foe) {
          t.foe = foe.id;
          t.target = { x: foe.x, z: foe.z };
          this.trade(t, foe, dt);
          return;
        }

        // No one to hit: pull the enemy's shrine apart instead.
        const shrine = this.sites.find(
          (site) =>
            site.kind === "shrine" &&
            site.placed > 0 &&
            site.clanId !== t.clanId &&
            Math.hypot(site.x - t.x, site.z - t.z) < 3 &&
            atWar(clan, this.clans.find((c) => c.id === site.clanId)!),
        );
        if (shrine) {
          t.taskTimer += dt;
          t.hop = Math.max(t.hop, 0.9);
          if (t.taskTimer > 1.2) {
            t.taskTimer = 0;
            shrine.placed = Math.max(0, shrine.placed - 1);
            shrine.complete = false;
            const victim = this.clans.find((c) => c.id === shrine.clanId);
            if (victim) {
              adjustRelation(clan, victim, -0.06);
              if (this.rand() < 0.12)
                this.addLog(
                  `The ${clan.name} pull stones from the ${victim.name}'s shrine.`,
                  "war",
                );
            }
          }
          return;
        }

        const enemy = this.nearestEnemy(t, 40);
        if (enemy) t.target = { x: enemy.x, z: enemy.z };
        else if (atTarget) {
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "flee": {
        t.health = Math.min(1, t.health + dt * 0.02);
        if (atTarget || t.health > 0.7) {
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

  /**
   * Two creatures from different clans got talking. The more devout one may
   * carry the other's god home with them — the quiet way a faith spreads, and
   * a reliable way to make the losing clan furious.
   */
  private maybeConvert(speaker: Thronglet, listener: Thronglet) {
    const mine = this.clanOf(speaker);
    const theirs = this.clanOf(listener);
    if (!mine || !theirs || mine.id === theirs.id) return;
    if (atWar(mine, theirs)) return; // nobody is listening during a war

    const push = speaker.genome.devotion * mine.faith.zeal;
    const hold = listener.genome.devotion * theirs.faith.zeal;
    if (push <= hold * 1.4) return;
    if (this.rand() > 0.12) return;

    listener.clanId = mine.id;
    listener.spirit = 0.2;
    listener.emote = { icon: "faith", t: 2 };
    mine.converts++;
    this.converted++;
    adjustRelation(mine, theirs, -0.05);
    this.addLog(
      `${listener.name} leaves the ${theirs.name} for ${mine.faith.deity}.`,
      "convert",
    );
  }

  /** One exchange of blows. The struck one either answers or runs. */
  private trade(attacker: Thronglet, foe: Thronglet, dt: number) {
    attacker.taskTimer += dt;
    attacker.heading = Math.atan2(foe.x - attacker.x, foe.z - attacker.z);
    if (attacker.combatTimer > 0) return;

    attacker.combatTimer = 0.7;
    attacker.hop = Math.max(attacker.hop, 1.1);
    attacker.emote = { icon: "clash", t: 0.9 };
    this.skirmishes++;
    foe.hurt = 1;
    // Standing fights mostly end in someone running. It is the chasing down
    // afterwards that actually kills.
    const rout = foe.task === "flee" ? 1.9 : 1;
    foe.health -= (0.045 + attacker.genome.aggression * 0.07) * rout;

    const mine = this.clanOf(attacker);
    const theirs = this.clanOf(foe);

    if (foe.health <= 0) {
      foe.alive = false;
      foe.slain = true;
      attacker.kills++;
      this.killed++;
      if (theirs) theirs.losses++;
      if (mine && theirs) adjustRelation(mine, theirs, -0.12);
      this.addLog(
        `${foe.name} of the ${theirs?.name ?? "lost"} falls to ${attacker.name}.`,
        "kill",
      );
      attacker.foe = null;
      attacker.task = "idle";
      attacker.thinkTimer = 0;
      return;
    }

    // Answer or run, depending on how much fight is left in them.
    if (foe.health < 0.55 || foe.genome.aggression < 0.35) {
      this.startTask(foe, "flee");
    } else if (foe.task !== "raid") {
      foe.task = "raid";
      foe.foe = attacker.id;
      foe.target = { x: attacker.x, z: attacker.z };
      foe.thought = `${attacker.name} started it.`;
      foe.stuck = 0;
    }
    if (mine && theirs) adjustRelation(mine, theirs, -0.01);
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

      // A gentle tether to the village for anyone not on an errand elsewhere.
      if (t.task === "wander") {
        const clan = this.clanOf(t);
        if (clan) {
          const hx = clan.home.x - t.x;
          const hz = clan.home.z - t.z;
          const hd = Math.hypot(hx, hz);
          if (hd > 16) {
            dx += (hx / hd) * 0.8;
            dz += (hz / hd) * 0.8;
          }
        }
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
