import { gauss, mulberry32, pick, range, type Rand } from "./random";
import {
  borrow,
  coin,
  coinWord,
  CONCEPTS,
  distance,
  reinforce,
  say,
  type Concept,
} from "./language";
import {
  chill,
  initialWeather,
  SEASON_LABEL,
  SKY_LABEL,
  stepWeather,
  YEAR_LENGTH,
  type WeatherState,
} from "./weather";
import {
  adjustRelation,
  atWar,
  driftRelations,
  makeClan,
  makeFaith,
  relationOf,
  splinterFaith,
  type Clan,
  type Discovery,
  type Faith,
} from "./clans";
import {
  findLandSpot,
  fruitSlotsFor,
  scatterBushes,
  scatterPonds,
  scatterRocks,
  scatterTrees,
  scatterTubs,
  TREE_TRAITS,
  WATER_LEVEL,
  WORLD_RADIUS,
  type Bush,
  type Rock,
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

/** How many colour schemes creatures come in. */
export const MORPH_COUNT = 7;

/** Side of one spatial-index cell, a little wider than the separation radius. */
const CELL = 1.6;

/** Ground is worn into paths on a grid this fine. */
export const WEAR_CELL = 1.5;

/** How far a finished structure keeps wandering thronglets out. */
const FOOTPRINT: Record<StructureKind, number> = {
  cairn: 0.7,
  hut: 1.5,
  hearth: 0.6,
  shrine: 1.2,
  well: 0.8,
  granary: 1.3,
  farm: 0,
  tower: 1.0,
  monolith: 1.2,
};
export const DAY_LENGTH = 150; // sim seconds for a full day/night cycle
export const POP_CAP = 560;

/** A clan this big starts looking for reasons to split. */
const SCHISM_SIZE = 30;
/** Past this many living clans the island stops splintering further. */
const MAX_CLANS = 14;
/** Villages are kept at least this far apart. */
const VILLAGE_SPACING = 36;

/**
 * What a thronglet has ended up doing with itself. Roles are not assigned:
 * each one settles into whatever its traits and its town's shortages point at,
 * and then does that thing better than its neighbours.
 */
export type Role =
  | "forager"
  | "builder"
  | "quarrier"
  | "farmer"
  | "priest"
  | "warrior";

export const ROLE_LABEL: Record<Role, string> = {
  forager: "forager",
  builder: "builder",
  quarrier: "quarrier",
  farmer: "farmer",
  priest: "priest",
  warrior: "warrior",
};

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
  | "flee"
  | "stock"
  | "tend"
  | "trade";

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
  /** Which colour scheme this one wears. Inherited, occasionally mutated. */
  morph: number;
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
  carryingStone: number;
  carryingFood: number;
  /** Which material this trip is for. */
  hauling: Material;
  targetRock: number | null;
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
  /** The hut this one sleeps in, once the village has built enough of them. */
  homeSite: number | null;

  memory: Memory[];
  /** Things worth remembering having happened to them, newest last. */
  episodes: string[];
  /** The words this one personally knows — learned by hearing, not by decree. */
  known: Set<Concept>;
  /** The trade this one has settled into. */
  role: Role;
  /** What is currently killing this one, if anything. */
  dyingOf: "hunger" | "thirst" | null;
  /** How strongly this one senses being looked at, 0–1. */
  awareness: number;
  /** Seconds left of staring straight up the camera. */
  staring: number;
  /** Set while the player is holding this one off the ground. */
  held: boolean;
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

export type Material = "wood" | "stone" | "thatch";

export type Block = {
  x: number;
  y: number;
  z: number;
  color: number;
  mat: Material;
};

export type StructureKind =
  | "cairn"
  | "hut"
  | "hearth"
  | "shrine"
  | "well"
  | "granary"
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
  /** Materials delivered and still on site. */
  wood: number;
  stone: number;
  woodNeeded: number;
  stoneNeeded: number;
  complete: boolean;
  /** Granaries hold food; wells hold nothing but count as water. */
  store: number;
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
  words: number;
  towns: number;
  stoneLeft: number;
  sky: string;
  season: string;
  year: number;
  warmth: number;
  snow: number;
  discoveries: number;
  attention: number;
  watching: number;
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
  outposts: number;
  towns: string[];
  traded: number;
  lessons: { thirst: number; famine: number; raided: number };
  roles: Record<string, number>;
  tongue: {
    concept: string;
    word: string;
    borrowedFrom: string | null;
    coinedBy: string;
    spread: number;
  }[];
  discoveries: { what: string; by: string; day: number }[];
  /** How far each neighbour's tongue has drifted from this one. */
  drift: { name: string; value: number }[];
};

/** What they think when they notice. Deliberately not cute. */
const WATCHED_THOUGHTS = [
  "the sky is close today.",
  "something is above the sky.",
  "it does not blink.",
  "it moved when I moved.",
  "we are being counted.",
  "why us.",
  "it lifted Vek. it put him back.",
  "hello?",
  "you.",
];

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
}[] = [
  { kind: "cairn", label: "Cairn", knowledge: 0 },
  { kind: "hearth", label: "Hearth", knowledge: 0 },
  { kind: "hut", label: "Hut", knowledge: 25 },
  { kind: "well", label: "Well", knowledge: 40 },
  { kind: "shrine", label: "Shrine", knowledge: 55 },
  { kind: "granary", label: "Granary", knowledge: 70 },
  { kind: "farm", label: "Grove plot", knowledge: 90 },
  { kind: "tower", label: "Watchtower", knowledge: 220 },
  { kind: "monolith", label: "Monolith", knowledge: 450 },
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

  // Thatch and turf are free: it is the timber and the stone they have to
  // fetch, so those are the only colours that cost anything.
  const matOf = (color: number): Material => {
    if (color === leaf || color === dirt) return "thatch";
    if (color === wood || color === woodDark || color === accent) return "wood";
    return "stone";
  };
  const push = (x: number, y: number, z: number, color: number) =>
    b.push({ x, y, z, color, mat: matOf(color) });

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
  } else if (kind === "hearth") {
    // A ring of stones and a stack of wood. Small, cheap, and the difference
    // between a colony that survives its first winter and one that doesn't.
    for (const [x, z] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, 1],
    ] as [number, number][])
      push(x, 0, z, stoneDark);
    push(0, 0, 0, woodDark);
    push(0, 1, 0, wood);
    push(0, 2, 0, 0xff9a3c);
  } else if (kind === "well") {
    // A stone ring with a thatched roof over it — water in the town, so
    // nobody has to cross the island for a drink.
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && z === 0) continue;
        push(x, 0, z, stone);
        push(x, 1, z, stoneDark);
      }
    push(-1, 2, -1, wood);
    push(1, 2, 1, wood);
    push(-1, 3, -1, wood);
    push(1, 3, 1, wood);
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) push(x, 4, z, leaf);
  } else if (kind === "granary") {
    // A raised store on stone footings: what a colony builds once it has
    // learned that a bad week kills.
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as [number, number][])
      push(x, 0, z, stoneDark);
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) push(x, 1, z, woodDark);
    for (let y = 2; y <= 4; y++)
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) {
          if (Math.abs(x) === 2 || Math.abs(z) === 2) push(x, y, z, wood);
        }
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) push(x, 5, z, leaf);
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

/** Grid key for the wear map, and its inverse. */
export function wearKey(x: number, z: number) {
  return (
    (Math.floor(x / WEAR_CELL) + 2048) * 4096 + (Math.floor(z / WEAR_CELL) + 2048)
  );
}

export function wearCentre(key: number) {
  const gx = Math.floor(key / 4096) - 2048;
  const gz = (key % 4096) - 2048;
  return { x: (gx + 0.5) * WEAR_CELL, z: (gz + 0.5) * WEAR_CELL };
}

export class Colony {
  rand: Rand;
  terrain: Terrain;
  trees: Tree[] = [];
  bushes: Bush[] = [];
  rocks: Rock[] = [];
  tubs: Tub[] = [];
  thronglets: Thronglet[] = [];
  eggs: Egg[] = [];
  sites: BuildSite[] = [];
  drops: { x: number; z: number; y: number; life: number }[] = [];
  clans: Clan[] = [];
  faiths: Faith[] = [];

  time = DAY_LENGTH * 0.18; // start mid-morning
  weather: WeatherState = initialWeather();
  /** Things that have happened for the first time, so they only read as news once. */
  firsts = new Set<string>();
  /**
   * How much the Throng has worked out about its own situation. Rises with
   * knowledge and with every monolith they raise, and it is the only number
   * here that is about you rather than about them.
   */
  attention = 0;
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
  /**
   * How much each patch of ground has been walked on. Routes people actually
   * use wear down into paths; everything else grows back over.
   */
  wear = new Map<number, number>();
  private wearDecay = 0;
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
    this.rocks = scatterRocks(this.rand, this.terrain, this.trees);
    this.tubs = scatterTubs(this.rand, this.terrain, this.trees);

    const start = this.newVillageSpot();
    const first = this.foundClan(start);
    for (let i = 0; i < 22; i++) {
      const spot = findLandSpot(this.rand, this.terrain, start, 7);
      this.spawn(
        spot.x,
        spot.z,
        this.randomGenome(),
        1,
        null,
        i < 11 ? 40 : 12,
        null,
        makeName(this.rand),
        first.id,
      );
    }
    this.addLog(
      `Twenty-two thronglets blink awake and call themselves the ${first.name}.`,
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
      morph: Math.floor(r() * MORPH_COUNT),
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
      // Colour is inherited whole from one parent, and now and then a child
      // turns up wearing something neither of them had.
      morph:
        r() < 0.06
          ? Math.floor(r() * MORPH_COUNT)
          : r() < 0.5
            ? a.morph
            : b.morph,
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
      carryingStone: 0,
      carryingFood: 0,
      hauling: "wood",
      targetRock: null,
      blocksPlaced: 0,
      mealsEaten: 0,
      childCount: 0,
      kills: 0,
      foe: null,
      combatTimer: 0,
      hurt: 0,
      slain: false,
      role: "forager",
      dyingOf: null,
      homeSite: null,
      memory: [],
      episodes: [],
      known: new Set<Concept>(),
      awareness: 0,
      staring: 0,
      held: false,
      bob: this.rand() * 10,
      hop: 0,
      emote: null,
    };
    this.updateStage(t);
    this.thronglets.push(t);
    this.generation = Math.max(this.generation, gen);
    return t;
  }

  /**
   * Settle on a trade. Traits do most of the work, but a town short of stone
   * turns foragers into quarriers, and a town with a farm needs somebody on
   * it — so the same creature born into two different towns ends up doing
   * different work.
   */
  private chooseRole(t: Thronglet): Role {
    const g = t.genome;
    const clan = this.clanOf(t);
    const scores: Record<Role, number> = {
      forager: 0.35 + g.curiosity * 0.5,
      builder: g.industry * 0.9,
      quarrier: g.industry * 0.6,
      farmer: g.industry * 0.5 + g.sociability * 0.2,
      priest: g.devotion * 1.0,
      warrior: g.aggression * 0.95,
    };

    if (clan) {
      const site = this.sites.find((s) => !s.complete && s.clanId === clan.id);
      if (site) {
        if (site.stone < site.stoneNeeded) scores.quarrier += 0.45;
        if (site.wood < site.woodNeeded) scores.builder += 0.3;
      }
      const farms = this.sites.filter(
        (s) => s.complete && s.kind === "farm" && s.clanId === clan.id,
      ).length;
      const farmers = this.thronglets.filter(
        (o) => o.clanId === clan.id && o.role === "farmer",
      ).length;
      if (farms > 0 && farmers < farms * 4) scores.farmer += 0.6;
      else if (farms === 0) scores.farmer = 0;

      if (clan.lessons.raided > 2) scores.warrior += 0.3;
      const priests = this.thronglets.filter(
        (o) => o.clanId === clan.id && o.role === "priest",
      ).length;
      if (priests > Math.max(1, clan.members * 0.15)) scores.priest -= 0.5;
    }

    let best: Role = "forager";
    for (const role of Object.keys(scores) as Role[]) {
      if (scores[role] > scores[best]) best = role;
    }
    return best;
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

  /* ---------------- language ---------------- */

  /**
   * Something happened worth having a word for. If the clan has no word yet,
   * this one coins it; otherwise saying it again makes it stick.
   */
  private name(t: Thronglet, concept: Concept) {
    const clan = this.clanOf(t);
    if (!clan) return null;
    const existing = say(clan.lexicon, concept);
    if (existing) {
      reinforce(clan.lexicon, concept);
      // You only know a word if you have said it or heard it.
      t.known.add(concept);
      return existing;
    }
    // Not everyone is a coiner — it takes a talkative one, and a moment.
    if (this.rand() > 0.25 * (0.4 + t.genome.sociability)) return null;
    const event = coin(this.rand, clan.lexicon, clan.phonology, concept, t.name);
    if (event) {
      t.known.add(concept);
      this.remember(t, `named ${concept} “${event.word}”`);
      this.addLog(
        `${t.name} of the ${clan.name} calls it “${event.word}” — ${concept}.`,
        "word",
      );
      this.first(
        "word",
        `First word on the island: ${t.name} calls ${concept} “${event.word}”.`,
        "first",
      );
      this.knowledge += 1.5;
    }
    return event?.word ?? null;
  }

  /* ---------------- clans and faith ---------------- */

  clanOf(t: Thronglet): Clan {
    return this.clans.find((c) => c.id === t.clanId) ?? this.clans[0];
  }

  /**
   * The hut this one lives in. Claims the least crowded hut in its own
   * village the first time it needs somewhere to sleep, and re-claims if that
   * hut is torn down.
   */
  homeHut(t: Thronglet): BuildSite | null {
    const current = this.sites.find(
      (s) => s.id === t.homeSite && s.complete && s.kind === "hut",
    );
    if (current) return current;

    const clan = this.clanOf(t);
    const options = this.sites.filter(
      (s) => s.complete && s.kind === "hut" && (!clan || s.clanId === clan.id),
    );
    if (!options.length) {
      t.homeSite = null;
      return null;
    }

    const load = new Map<number, number>();
    for (const o of this.thronglets)
      if (o.homeSite !== null) load.set(o.homeSite, (load.get(o.homeSite) ?? 0) + 1);

    const best = options.reduce((a, b) => {
      const score = (s: BuildSite) =>
        (load.get(s.id) ?? 0) * 6 + Math.hypot(s.x - t.x, s.z - t.z);
      return score(a) <= score(b) ? a : b;
    });
    t.homeSite = best.id;
    return best;
  }

  /**
   * A worked farm, ready for someone to put time into. Farms only yield if
   * they are tended, which is what makes farmers a job rather than a label.
   */
  farmFor(t: Thronglet): BuildSite | null {
    let best: BuildSite | null = null;
    let bestD = Infinity;
    for (const s of this.sites) {
      if (!s.complete || s.kind !== "farm" || s.clanId !== t.clanId) continue;
      if (s.store >= 30) continue;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Anywhere with food in it: a granary, or a farm with a standing crop. */
  private storeFor(t: Thronglet): BuildSite | null {
    let best: BuildSite | null = null;
    let bestD = Infinity;
    for (const s of this.sites) {
      if (!s.complete || s.clanId !== t.clanId) continue;
      if (s.kind !== "granary" && s.kind !== "farm") continue;
      if (s.store <= 0) continue;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * How sheltered a spot is from the cold, 0–1. Only a lit hearth helps, and
   * only if somebody worked out fire in the first place.
   */
  warmthAt(x: number, z: number) {
    let best = 0;
    for (const s of this.sites) {
      if (!s.complete || s.kind !== "hearth") continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d > 7) continue;
      best = Math.max(best, 1 - d / 7);
    }
    return best;
  }

  /** The clan's nearest finished granary, if they have built one. */
  granaryOf(t: Thronglet, needsStock = false): BuildSite | null {
    let best: BuildSite | null = null;
    let bestD = Infinity;
    for (const s of this.sites) {
      if (!s.complete || s.kind !== "granary" || s.clanId !== t.clanId) continue;
      if (needsStock && s.store <= 0) continue;
      if (!needsStock && s.store >= 40) continue;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
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
    // Name the place in their own tongue.
    clan.townNames.push(coinWord(this.rand, clan.phonology));
    this.clans.push(clan);
    return clan;
  }

  /**
   * Somewhere far enough from every existing village to be its own place, and
   * close enough to water and trees to survive there. Settling a clan on a dry
   * hill is a slow death sentence for it.
   */
  private newVillageSpot(near?: { x: number; z: number }, spread?: number) {
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < 200; i++) {
      const spot = findLandSpot(
        this.rand,
        this.terrain,
        near,
        spread ?? WORLD_RADIUS * 0.85,
      );
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

  /** Something happened to this one that it will carry around afterwards. */
  remember(t: Thronglet, what: string) {
    t.episodes.push(what);
    if (t.episodes.length > 8) t.episodes.shift();
  }

  /** Log something only the first time it ever happens. */
  private first(key: string, text: string, kind: string) {
    if (this.firsts.has(key)) return false;
    this.firsts.add(key);
    this.addLog(text, kind);
    return true;
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
      words: this.clans
        .filter((c) => c.members > 0)
        .reduce((n, c) => n + c.lexicon.size, 0),
      towns: this.clans
        .filter((c) => c.members > 0)
        .reduce((n, c) => n + 1 + c.outposts.length, 0),
      stoneLeft: Math.round(this.rocks.reduce((n, r) => n + r.stone, 0)),
      sky: SKY_LABEL[this.weather.sky],
      season: SEASON_LABEL[this.weather.season],
      year: this.weather.year,
      warmth: this.weather.warmth,
      snow: this.weather.settled,
      discoveries: new Set(
        this.clans.flatMap((c) => Array.from(c.discoveries.keys())),
      ).size,
      attention: this.attention,
      watching: this.thronglets.filter((t) => t.staring > 0).length,
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
        outposts: c.outposts.length,
        discoveries: Array.from(c.discoveries.entries()).map(([what, d]) => ({
          what,
          by: d.by,
          day: d.day,
        })),
        towns: [...c.townNames],
        traded: c.traded,
        lessons: { ...c.lessons },
        roles: this.thronglets
          .filter((t) => t.clanId === c.id)
          .reduce<Record<string, number>>((a, t) => {
            a[t.role] = (a[t.role] ?? 0) + 1;
            return a;
          }, {}),
        tongue: Array.from(c.lexicon.entries()).map(([concept, w]) => ({
          concept,
          word: w.word,
          borrowedFrom: w.borrowedFrom,
          coinedBy: w.coinedBy,
          // How much of the clan actually has this word.
          spread: c.members
            ? this.thronglets.filter(
                (t) => t.clanId === c.id && t.known.has(concept),
              ).length / c.members
            : 0,
        })),
        drift: this.clans
          .filter((o) => o.id !== c.id && o.members > 0)
          .map((o) => ({
            name: o.name,
            value: distance(c.lexicon, o.lexicon),
          })),
      }));
  }

  /* ---------------- world queries ---------------- */

  private noteSpot(t: Thronglet, x: number, z: number, kind: Memory["kind"]) {
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

  nearestRock(t: Thronglet) {
    let best: Rock | null = null;
    let bestD = Infinity;
    for (const r of this.rocks) {
      if (r.stone <= 4) continue;
      const d = Math.hypot(r.x - t.x, r.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = r;
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
    // A finished well is the whole point of digging one: water in the town.
    for (const site of this.sites) {
      if (!site.complete || site.kind !== "well") continue;
      const d = Math.hypot(site.x - t.x, site.z - t.z) - 1.4;
      if (d < bestD) {
        bestD = d;
        best = { x: site.x + 1.5, z: site.z + 1.1 };
      }
    }
    return best;
  }

  activeSite(): BuildSite | null {
    for (const s of this.sites) if (!s.complete) return s;
    return null;
  }

  /**
   * The unfinished site this one should be working on: their own clan's
   * nearest, so nobody walks across the island to help strangers build.
   */
  siteFor(t: Thronglet): BuildSite | null {
    let best: BuildSite | null = null;
    let bestD = Infinity;
    for (const s of this.sites) {
      if (s.complete || s.clanId !== t.clanId) continue;
      const d = Math.hypot(s.x - t.x, s.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
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

      this.maybeOutpost(clan);
      const choice = this.chooseStructure(clan);
      if (!choice) continue;
      const spot = this.villagePlot(clan, choice.kind);
      if (!spot) continue;

      const blocks = layout(choice.kind, this.rand, clan.color);
      this.sites.push({
        id: this.nextSiteId++,
        clanId: clan.id,
        kind: choice.kind,
        x: spot.x,
        z: spot.z,
        y: this.terrain.height(spot.x, spot.z),
        blocks,
        placed: 0,
        wood: 0,
        stone: 0,
        // What it actually takes to put this thing up, counted off the plan.
        woodNeeded: blocks.filter((b) => b.mat === "wood").length,
        stoneNeeded: blocks.filter((b) => b.mat === "stone").length,
        complete: false,
        store: 0,
      });
      this.addLog(
        `The ${clan.name} start a ${choice.label.toLowerCase()}.`,
        "build",
      );
    }
  }

  private chooseStructure(clan: Clan) {
    const unlocked = STRUCTURE_TIERS.filter(
      (s) =>
        this.knowledge >= s.knowledge &&
        // You cannot build a fire you have not worked out.
        (s.kind !== "hearth" || clan.discoveries.has("fire")),
    );
    if (!unlocked.length) return null;
    const built = this.sites.filter((s) => s.complete && s.clanId === clan.id);
    const has = (k: StructureKind) => built.some((s) => s.kind === k);
    const planned = (k: StructureKind) =>
      this.sites.some((s) => s.clanId === clan.id && s.kind === k && !s.complete);
    const know = (k: StructureKind) =>
      this.knowledge >= STRUCTURE_TIERS.find((t) => t.kind === k)!.knowledge;

    // Everything they have buried teaches them something. A clan that has
    // watched people die of thirst digs a well before it raises a monument.
    if (clan.lessons.thirst >= 2 && know("well") && !has("well") && !planned("well"))
      return STRUCTURE_TIERS.find((t) => t.kind === "well")!;
    if (
      clan.lessons.famine >= 2 &&
      know("granary") &&
      !has("granary") &&
      !planned("granary")
    )
      return STRUCTURE_TIERS.find((t) => t.kind === "granary")!;
    if (clan.lessons.raided >= 3 && know("tower") && !planned("tower"))
      return STRUCTURE_TIERS.find((t) => t.kind === "tower")!;

    // A people wants somewhere to pray and somewhere to sleep before it wants
    // a monument.
    const shrine = STRUCTURE_TIERS.find((t) => t.kind === "shrine")!;
    if (this.knowledge >= shrine.knowledge && !has("shrine") && !planned("shrine"))
      return shrine;

    // Fire first, once they have it and the cold is real.
    const hearths = built.filter((s) => s.kind === "hearth").length;
    if (
      clan.discoveries.has("fire") &&
      hearths * 14 < clan.members + 8 &&
      !planned("hearth")
    )
      return STRUCTURE_TIERS.find((t) => t.kind === "hearth")!;

    // A town that only ever builds housing never becomes a town. Once there
    // is somewhere to sleep, the store and the fields come before more huts.
    const hut = STRUCTURE_TIERS.find((t) => t.kind === "hut")!;
    const huts = built.filter((s) => s.kind === "hut").length;

    const granary = STRUCTURE_TIERS.find((t) => t.kind === "granary")!;
    if (
      know("granary") &&
      huts >= 2 &&
      !has("granary") &&
      !planned("granary")
    )
      return granary;

    const farm = STRUCTURE_TIERS.find((t) => t.kind === "farm")!;
    const farms = built.filter((s) => s.kind === "farm").length;
    if (
      know("farm") &&
      has("granary") &&
      farms < 1 + Math.floor(clan.members / 25) &&
      !planned("farm")
    )
      return farm;

    const wellKnown = know("well");
    if (wellKnown && huts >= 1 && !has("well") && !planned("well"))
      return STRUCTURE_TIERS.find((t) => t.kind === "well")!;

    if (this.knowledge >= hut.knowledge && huts * 5 < clan.members) return hut;

    const weights = unlocked.map((_, i) => (i === unlocked.length - 1 ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.rand() * total;
    for (let i = 0; i < unlocked.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return unlocked[i];
    }
    return unlocked[0];
  }

  /** Every centre this clan builds around: the town, plus any outposts. */
  private centresOf(clan: Clan) {
    return [clan.home, ...clan.outposts];
  }

  /**
   * A town that has filled its rings sends people out to start another one.
   * This is how a clan spreads across the island without splitting in two.
   */
  private maybeOutpost(clan: Clan) {
    if (clan.members < 20) return;
    const built = this.sites.filter((s) => s.complete && s.clanId === clan.id).length;
    if (built < 6 + clan.outposts.length * 5) return;
    if (clan.outposts.length >= 3) return;
    if (this.rand() > 0.4) return;

    const spot = this.newVillageSpot(clan.home, 20);
    if (!spot) return;
    clan.outposts.push(spot);
    const name = coinWord(this.rand, clan.phonology);
    clan.townNames.push(name);
    this.name(
      this.thronglets.find((t) => t.clanId === clan.id) ?? this.thronglets[0],
      "town",
    );
    this.addLog(
      `The ${clan.name} break ground on a new town and call it ${name}.`,
      "expand",
    );
  }

  private villagePlot(clan: Clan, kind: StructureKind) {
    const clear = (x: number, z: number, gap: number) =>
      Math.hypot(x, z) < WORLD_RADIUS * 0.93 &&
      this.terrain.height(x, z) >= WATER_LEVEL + 0.6 &&
      !this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < gap) &&
      !this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.5);

    // The shrine takes the middle of the town; everything else rings it.
    if (kind === "shrine" && clear(clan.home.x, clan.home.z, 4.5))
      return { x: clan.home.x, z: clan.home.z };

    const centres = this.centresOf(clan);
    // Wells go where the water is, if there is any near a centre.
    if (kind === "well") {
      for (const centre of centres) {
        const pond = this.terrain.ponds
          .map((p) => ({ p, d: Math.hypot(p.x - centre.x, p.z - centre.z) }))
          .sort((a, b) => a.d - b.d)[0];
        if (!pond || pond.d > 26) continue;
        const a = Math.atan2(centre.z - pond.p.z, centre.x - pond.p.x);
        for (let step = 0; step < 8; step++) {
          const r = pond.p.r + 1.4 + step * 1.2;
          const x = pond.p.x + Math.cos(a) * r;
          const z = pond.p.z + Math.sin(a) * r;
          if (clear(x, z, 4.4)) return { x, z };
        }
      }
    }

    for (let attempt = 0; attempt < 120; attempt++) {
      const centre = centres[Math.floor(this.rand() * centres.length)];
      const ring = 1 + Math.floor(attempt / 20);
      const radius = 4.6 + ring * 3.4 + this.rand() * 1.6;
      const a = this.rand() * Math.PI * 2;
      const x = centre.x + Math.cos(a) * radius;
      const z = centre.z + Math.sin(a) * radius;
      if (clear(x, z, 5.2)) return { x, z };
    }
    return null;
  }

  /* ---------------- main tick ---------------- */

  update(dt: number) {
    this.time += dt;

    this.rebuildGrid();
    this.updateWeather(dt);
    this.updateAttention(dt);
    this.countClans();
    driftRelations(this.clans, dt);
    this.updateWars(dt);
    this.updateFlora(dt);
    this.updateSites(dt);
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
      // A people that has learned burial marks the spot.
      const clan = this.clanOf(t);
      if (
        clan &&
        clan.discoveries.has("burial") &&
        this.sites.filter((s) => s.kind === "cairn").length < 40 &&
        this.rand() < 0.5
      ) {
        const blocks = layout("cairn", this.rand, clan.color);
        this.sites.push({
          id: this.nextSiteId++,
          clanId: clan.id,
          kind: "cairn",
          x: t.x,
          z: t.z,
          y: this.terrain.height(t.x, t.z),
          blocks,
          placed: 0,
          wood: 0,
          stone: 0,
          woodNeeded: blocks.filter((b) => b.mat === "wood").length,
          stoneNeeded: blocks.filter((b) => b.mat === "stone").length,
          complete: false,
          store: 0,
        });
      }
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

    // Paths fade if nobody uses them, so a route dies with the town it served.
    this.wearDecay -= dt;
    if (this.wearDecay <= 0) {
      this.wearDecay = 5;
      for (const [key, value] of Array.from(this.wear.entries())) {
        const next = value - 0.09;
        if (next <= 0.05) this.wear.delete(key);
        else this.wear.set(key, next);
      }
    }

    this.checkDiscoveries(dt);

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

  /* ---------------- weather ---------------- */

  get day() {
    return Math.floor(this.time / DAY_LENGTH);
  }

  /**
   * The Throng notices. Knowledge and monoliths make the colony collectively
   * aware that something is above it; individuals then look up, and what they
   * think stops being about food.
   */
  private updateAttention(dt: number) {
    const monoliths = this.sites.filter(
      (s) => s.complete && s.kind === "monolith",
    ).length;
    const target = Math.min(
      1,
      this.knowledge / 2600 + monoliths * 0.22 + this.clans.length * 0.01,
    );
    this.attention += (target - this.attention) * Math.min(1, dt * 0.05);

    if (this.attention > 0.12) {
      this.first(
        "watched",
        "Something in the throng turns over the idea of being looked at.",
        "watched",
      );
    }
    if (this.attention > 0.55) {
      this.first(
        "watched2",
        "They have started leaving the shrine to look upward instead.",
        "watched",
      );
    }
    if (this.attention > 0.9) {
      this.first("watched3", "They know. They are waiting for you to do something.", "watched");
    }

    if (this.attention < 0.08 || this.rand() > dt * 1.5) return;
    const t = this.thronglets[Math.floor(this.rand() * this.thronglets.length)];
    if (!t || t.held || t.stage === "baby") return;
    if (this.rand() > this.attention * (0.3 + t.genome.curiosity)) return;

    t.awareness = Math.min(1, t.awareness + 0.35);
    t.staring = range(this.rand, 1.4, 3.6);
    t.thought = pick(this.rand, WATCHED_THOUGHTS);
    if (t.awareness > 0.7 && this.rand() < 0.15) {
      this.remember(t, "looked up and saw something looking back");
      this.addLog(`${t.name} stops and looks straight up.`, "watched");
    }
  }

  private updateWeather(dt: number) {
    const p = this.dayPhase;
    const nightness = p > 0.72 || p < 0.06 ? 1 : p > 0.6 ? (p - 0.6) / 0.12 : 0;
    const change = stepWeather(this.weather, this.rand, dt, this.day, nightness);
    if (!change) return;

    if (change.seasonChanged) {
      this.addLog(
        `${SEASON_LABEL[change.season][0].toUpperCase()}${SEASON_LABEL[change.season].slice(1)} comes round again.`,
        "season",
      );
    }
    // The first time the island sees a thing, that is news.
    if (change.sky === "snow") {
      this.first(
        "snow",
        "Snow begins to fall — the world turns quiet and white.",
        "weather",
      );
    } else if (change.sky === "rain") {
      this.first("rain", "Rain begins.", "weather");
    }
  }

  /**
   * Invention. Nobody is granted anything: a particular creature works a
   * particular thing out because of the situation it is standing in, and the
   * island hears about it afterwards.
   */
  private checkDiscoveries(dt: number) {
    if (this.rand() > dt * 4) return;
    // Sample a handful rather than one, so a pressure that only a few are
    // under still gets noticed.
    let t: Thronglet | null = null;
    for (let i = 0; i < 6 && !t; i++) {
      const pick_ = this.thronglets[
        Math.floor(this.rand() * this.thronglets.length)
      ];
      if (pick_ && pick_.stage !== "baby" && !pick_.held) t = pick_;
    }
    if (!t) return;
    const clan = this.clanOf(t);
    if (!clan) return;

    const learn = (what: Discovery, story: string) => {
      if (clan.discoveries.has(what)) return false;
      clan.discoveries.set(what, { by: t.name, day: this.day });
      this.knowledge += 25;
      this.remember(t, story);
      this.addLog(
        `${t.name} of the ${clan.name} ${story}`,
        "discovery",
      );
      this.first(
        `discovery:${what}`,
        `First ${what} on the island — ${t.name} of the ${clan.name}.`,
        "first",
      );
      return true;
    };

    const cold = chill(this.weather);

    // Fire: worked out by somebody awake and freezing, with wood to hand.
    if (
      !clan.discoveries.has("fire") &&
      cold > 0.55 &&
      t.task !== "sleep" &&
      this.warmthAt(t.x, t.z) < 0.1 &&
      (t.carryingWood > 0 || this.nearestTreeWithWood(t)) &&
      this.rand() < 0.5 * (0.3 + t.genome.curiosity)
    ) {
      if (learn("fire", "works out fire on a bitter night.")) {
        this.name(t, "fire");
        return;
      }
    }

    // Cooking follows fire, once somebody hungry is sitting at one.
    if (
      clan.discoveries.has("fire") &&
      !clan.discoveries.has("cooking") &&
      this.warmthAt(t.x, t.z) > 0.4 &&
      t.hunger > 0.5 &&
      this.rand() < 0.3
    ) {
      learn("cooking", "holds food to the fire and finds it is better for it.");
      return;
    }

    // Baskets: worked out by somebody who has carried enough loads to resent it.
    if (
      !clan.discoveries.has("baskets") &&
      t.blocksPlaced > 12 &&
      (t.carryingWood > 0 || t.carryingStone > 0) &&
      this.rand() < 0.12
    ) {
      learn("baskets", "weaves something to carry more in.");
      return;
    }

    // Burial: after a clan has buried enough of its own.
    if (
      !clan.discoveries.has("burial") &&
      clan.losses + clan.lessons.famine + clan.lessons.thirst >= 3 &&
      this.rand() < 0.1
    ) {
      learn("burial", "stacks stones over the dead so the place is remembered.");
      return;
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
      if (!met) continue;
      this.tradeWords(t, met);
      this.maybeConvert(t, met);
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

  private updateSites(dt: number) {
    for (const s of this.sites) {
      if (!s.complete) continue;
      // Standing crops keep growing a little on their own, and stores spoil.
      if (s.kind === "farm" && s.store > 0) s.store = Math.min(30, s.store + dt * 0.02);
      if (s.kind === "granary" && s.store > 0) s.store = Math.max(0, s.store - dt * 0.004);
    }
  }

  private updateFlora(dt: number) {
    // Nothing much grows under snow; everything grows in the wet.
    const growth =
      this.weather.sky === "snow" || this.weather.settled > 0.4
        ? 0.25
        : this.weather.sky === "rain"
          ? 1.6
          : 1;
    for (const tr of this.trees) {
      tr.regrow += dt * growth;
      if (tr.regrow > 26 && tr.fruit < tr.capacity) {
        tr.regrow = 0;
        tr.fruit++;
      }
      if (tr.wood < 60) tr.wood += dt * 0.35;
    }
    for (const b of this.bushes) {
      b.regrow += dt * growth;
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
    if (t.held) {
      // Dangling from a giant hand: needs still tick, but nothing else does.
      this.updateStage(t);
      t.hunger = Math.min(1, t.hunger + dt * 0.004);
      t.joy = Math.min(1, t.joy + dt * 0.02);
      t.vx = 0;
      t.vz = 0;
      t.bob += dt * 6;
      if (t.emote) {
        t.emote.t -= dt;
        if (t.emote.t <= 0) t.emote = null;
      }
      return;
    }
    this.updateStage(t);
    if (t.mateCooldown > 0) t.mateCooldown -= dt;
    if (t.staring > 0) {
      t.staring -= dt;
      t.vx = 0;
      t.vz = 0;
    }
    t.awareness = Math.max(0, t.awareness - dt * 0.01);
    if (t.emote) {
      t.emote.t -= dt;
      if (t.emote.t <= 0) t.emote = null;
    }

    // Cold is the pressure everything else answers to. Somewhere warm — a
    // hearth, or a hut at night — keeps it off them.
    const bite = chill(this.weather);
    if (bite > 0.05 && !t.held) {
      const warm = this.warmthAt(t.x, t.z);
      const exposure = bite * (1 - warm);
      if (exposure > 0.02) {
        t.energy = Math.min(1, t.energy + dt * exposure * 0.05);
        if (exposure > 0.55) t.health -= dt * (exposure - 0.55) * 0.05;
        if (exposure > 0.4 && this.rand() < dt * 0.05) this.name(t, "cold");
        // Nobody sleeps through a night like this, and somebody lying awake
        // in the cold is exactly who works fire out.
        if (exposure > 0.5 && t.task === "sleep") {
          t.task = "idle";
          t.thinkTimer = 0;
          t.thought = "too cold to sleep.";
        }
      }
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

    if (t.hunger > 0.97 || t.thirst > 0.97) {
      t.health -= dt * 0.06;
      t.dyingOf = t.thirst > t.hunger ? "thirst" : "hunger";
    } else if (t.hunger < 0.5 && t.thirst < 0.5) {
      t.health = Math.min(1, t.health + dt * 0.03);
      t.dyingOf = null;
    }

    if (t.health <= 0 || t.age > t.genome.lifespan) {
      t.alive = false;
      // A clan remembers what took its people, and builds accordingly.
      const clan = this.clanOf(t);
      if (clan && t.health <= 0 && t.dyingOf) {
        if (t.dyingOf === "thirst") clan.lessons.thirst++;
        else clan.lessons.famine++;
      }
      return;
    }

    // If a goal has been unreachable for half a minute, give up on it and go
    // somewhere else — otherwise one bad target can starve a whole colony.
    t.stuck += dt;
    // A caravan or a raiding party is a long walk across the island; give
    // those the room to finish before the watchdog calls it off.
    const patience = t.task === "trade" || t.task === "raid" ? 75 : 30;
    if (t.stuck > patience) {
      this.startTask(t, "wander");
      t.thought = "…this isn't working.";
    }

    t.thinkTimer -= dt;
    if (t.thinkTimer <= 0) {
      t.thinkTimer = range(this.rand, 0.6, 1.4);
      // Growing up, and now and then afterwards, they reconsider their trade.
      if (t.stage !== "baby" && this.rand() < 0.05) t.role = this.chooseRole(t);
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
    const site = this.siteFor(t);
    const pressure = Math.max(t.hunger, t.thirst);
    const calm = Math.max(0, 1 - pressure * pressure);
    if (site && t.stage !== "baby") {
      const short =
        site.wood < site.woodNeeded || site.stone < site.stoneNeeded;
      const next = site.blocks[site.placed];
      const canLay =
        next &&
        (next.mat === "thatch" ||
          (next.mat === "wood" ? site.wood > 0 : site.stone > 0));
      scores.gather = short ? 0.95 * g.industry * calm : 0;
      scores.build = canLay ? 1.0 * g.industry * calm : 0;
      if (t.carryingWood > 0 || t.carryingStone > 0)
        scores.build = Math.max(scores.build, 1.2 * calm);
    }

    // The work of a settled town, which has nothing to do with whether
    // anything happens to be under construction.
    if (clan && t.stage !== "baby") {
      // Filling the store is what they do with a good day.
      const granary = this.granaryOf(t);
      scores.stock =
        granary && t.hunger < 0.4 && this.nearestTreeWithFruit(t)
          ? 0.6 * g.industry * calm
          : 0;
      // Worked ground: the difference between foraging and farming.
      scores.tend = this.farmFor(t) ? 0.75 * g.industry * calm : 0;
      // Surplus plus a friendly neighbour is how a caravan starts.
      const spare = this.granaryOf(t, true);
      const friend = this.clans.some(
        (o) => o.members > 0 && o.id !== clan.id && relationOf(clan, o) > 0.3,
      );
      // Weighted to actually win sometimes: a caravan is a long walk, and it
      // will never happen if hauling one more log always scores higher.
      scores.trade =
        spare && friend && t.stage === "adult" && spare.store > 6
          ? 1.05 * (0.4 + g.sociability) * calm
          : 0;
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

    // A trade is a leaning, not a rule: a builder still eats when hungry.
    const lean: Partial<Record<Role, string[]>> = {
      builder: ["build", "gather"],
      quarrier: ["gather"],
      farmer: ["tend", "stock"],
      priest: ["worship"],
      warrior: ["raid"],
      forager: ["eat", "stock", "trade", "wander"],
    };
    for (const key of lean[t.role] ?? []) {
      if (scores[key] !== undefined) scores[key] *= 1.5;
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
      case "stock":
        return "stock";
      case "tend":
        return "tend";
      case "trade":
        return "trade";
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
        // The granary is the point of having one: in a lean week it is
        // closer than any tree still carrying fruit.
        const store = this.storeFor(t);
        const tree = this.nearestTreeWithFruit(t);
        const bush = this.nearestBushWithBerries(t);
        const dt_ = tree ? Math.hypot(tree.x - t.x, tree.z - t.z) : Infinity;
        const db = bush ? Math.hypot(bush.x - t.x, bush.z - t.z) : Infinity;
        const ds = store ? Math.hypot(store.x - t.x, store.z - t.z) : Infinity;
        if (store && ds < Math.min(dt_, db)) {
          t.task = "seekFood";
          t.targetSite = store.id;
          t.targetTree = null;
          t.target = { x: store.x + 1.4, z: store.z + 1.2 };
          t.thought = "the store will have some.";
          return;
        }
        if (tree && dt_ <= db) {
          t.task = "seekFood";
          t.targetTree = tree.id;
          t.target = { x: tree.x + 0.9, z: tree.z + 0.6 };
          t.thought = "apples.";
          this.noteSpot(t, tree.x, tree.z, "food");
        } else if (bush) {
          t.task = "seekFood";
          t.target = { x: bush.x + 0.6, z: bush.z + 0.4 };
          t.thought = "berries will do.";
          this.noteSpot(t, bush.x, bush.z, "food");
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
          this.noteSpot(t, w.x, w.z, "water");
        } else this.startTask(t, "wander");
        return;
      }
      case "sleep": {
        // Everyone claims a hut in their own village and goes back to it. The
        // walls are solid, so the spot sits just outside the footprint.
        const hut = this.homeHut(t);
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
        const site = this.siteFor(t);
        if (!site) {
          this.startTask(t, "wander");
          return;
        }
        // Fetch whatever the site is shortest of.
        const woodShort = Math.max(0, site.woodNeeded - site.wood);
        const stoneShort = Math.max(0, site.stoneNeeded - site.stone);
        const wantStone = stoneShort > woodShort;

        if (wantStone) {
          const rock = this.nearestRock(t);
          if (rock) {
            t.task = "gather";
            t.hauling = "stone";
            t.targetRock = rock.id;
            t.targetTree = null;
            t.targetSite = site.id;
            t.target = { x: rock.x + 0.9, z: rock.z + 0.6 };
            t.thought = "stone for the build.";
            return;
          }
        }
        const tree = this.nearestTreeWithWood(t);
        if (tree) {
          t.task = "gather";
          t.hauling = "wood";
          t.targetTree = tree.id;
          t.targetRock = null;
          t.targetSite = site.id;
          t.target = { x: tree.x + 0.8, z: tree.z + 0.5 };
          t.thought = "wood for the build.";
        } else this.startTask(t, "wander");
        return;
      }
      case "build": {
        const site = this.siteFor(t);
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
      case "tend": {
        const farm = this.farmFor(t);
        if (!farm) {
          this.startTask(t, "wander");
          return;
        }
        t.task = "tend";
        t.targetSite = farm.id;
        t.target = {
          x: farm.x + range(this.rand, -2.2, 2.2),
          z: farm.z + range(this.rand, -2.2, 2.2),
        };
        t.thought = "the plot needs working.";
        return;
      }
      case "stock": {
        const store = this.granaryOf(t);
        const tree = this.nearestTreeWithFruit(t);
        if (!store || !tree) {
          this.startTask(t, "wander");
          return;
        }
        t.task = "stock";
        t.targetSite = store.id;
        t.targetTree = tree.id;
        t.target = { x: tree.x + 0.9, z: tree.z + 0.6 };
        t.thought = "put some by.";
        return;
      }
      case "trade": {
        const mine = this.clanOf(t);
        if (!mine) {
          this.startTask(t, "wander");
          return;
        }
        // Somebody they are on good terms with, and near enough to walk to.
        const partner = this.clans
          .filter(
            (o) =>
              o.members > 0 &&
              o.id !== mine.id &&
              relationOf(mine, o) > 0.3 &&
              Math.hypot(o.home.x - t.x, o.home.z - t.z) < 70,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.home.x - t.x, a.home.z - t.z) -
              Math.hypot(b.home.x - t.x, b.home.z - t.z),
          )[0];
        const store = this.granaryOf(t, true);
        if (!partner || !store) {
          this.startTask(t, "wander");
          return;
        }
        t.task = "trade";
        t.targetSite = store.id;
        t.partner = partner.id;
        t.target = { x: store.x + 1.3, z: store.z + 1.1 };
        t.thought = `carry some to the ${partner.name}.`;
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
        const store = this.sites.find(
          (s) =>
            s.id === t.targetSite &&
            (s.kind === "granary" || s.kind === "farm") &&
            s.store > 0,
        );
        if (store) {
          store.store--;
          this.feed(t, 0.7);
          t.targetSite = null;
          return;
        }
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
          this.name(t, "water");
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
        if (this.rand() < 0.01) this.name(t, t.homeSite !== null ? "home" : "sleep");
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
          for (const m of p.memory) this.noteSpot(t, m.x, m.z, m.kind);
          this.name(t, p.clanId === t.clanId ? "friend" : "stranger");
          this.overhear(t, p);
          this.overhear(p, t);
          // Feed whoever is worse off than you — the reason babies survive a
          // bad week at all.
          if (p.hunger > 0.7 && t.hunger < 0.35 && p.clanId === t.clanId) {
            p.hunger = Math.max(0, p.hunger - 0.45);
            p.emote = { icon: "apple", t: 1.5 };
            this.name(t, "food");
          }
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
        if (this.rand() < 0.02) this.name(t, "play");
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

        // Loaded: take it back to the site.
        if (t.carryingWood > 0 || t.carryingStone > 0) {
          t.target = { x: site.x + 0.8, z: site.z + 0.8 };
          if (Math.hypot(site.x - t.x, site.z - t.z) < 2.2) {
            site.wood += t.carryingWood;
            site.stone += t.carryingStone;
            t.carryingWood = 0;
            t.carryingStone = 0;
            t.emote = { icon: "wood", t: 1.2 };
            t.task = "build";
            t.thinkTimer = 0.4;
          }
          return;
        }

        if (t.hauling === "stone") {
          const rock = this.rocks.find((r) => r.id === t.targetRock);
          if (!rock || rock.stone <= 4) {
            t.task = "idle";
            t.thinkTimer = 0;
            return;
          }
          t.target = { x: rock.x + 0.9, z: rock.z + 0.6 };
          if (Math.hypot(rock.x - t.x, rock.z - t.z) > 1.9) return;
          t.taskTimer += dt;
          t.hop = Math.max(t.hop, 0.7);
          if (t.taskTimer > 3.2) {
            this.name(t, "stone");
            const take = Math.min(7, Math.floor(rock.stone));
            rock.stone -= take;
            t.carryingStone = take;
            t.taskTimer = 0;
            t.thought = "carrying stone.";
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
          this.name(t, "wood");
          // Oak and pine give more per trip than an apple tree does.
          const base = tree.kind === "oak" ? 14 : tree.kind === "pine" ? 11 : 9;
          const yield_ = this.clanOf(t)?.discoveries.has("baskets")
            ? Math.round(base * 1.6)
            : base;
          const take = Math.min(yield_, Math.floor(tree.wood));
          tree.wood -= take;
          t.carryingWood = take;
          t.taskTimer = 0;
          t.thought = "carrying wood.";
        }
        return;
      }
      case "build": {
        const site = this.sites.find((s) => s.id === t.targetSite) ?? this.siteFor(t);
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
        if (t.carryingWood > 0 || t.carryingStone > 0) {
          site.wood += t.carryingWood;
          site.stone += t.carryingStone;
          t.carryingWood = 0;
          t.carryingStone = 0;
        }
        const next = site.blocks[site.placed];
        const haveMaterial =
          !next ||
          next.mat === "thatch" ||
          (next.mat === "wood" ? site.wood > 0 : site.stone > 0);
        if (!next || !haveMaterial) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.taskTimer += dt;
        t.hop = Math.max(t.hop, 0.8);
        if (t.taskTimer > 0.9) {
          t.taskTimer = 0;
          site.placed++;
          if (next.mat === "wood") site.wood -= 1;
          else if (next.mat === "stone") site.stone -= 1;
          t.blocksPlaced++;
          if (this.rand() < 0.05) this.name(t, "build");
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
          this.name(t, "god");
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
              victim.lessons.raided++;
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
      case "tend": {
        const farm = this.sites.find((s) => s.id === t.targetSite);
        if (!farm || !farm.complete) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        if (Math.hypot(farm.x - t.x, farm.z - t.z) > 3.4) return;
        t.taskTimer += dt;
        t.hop = Math.max(t.hop, 0.5);
        // Worked ground yields far more reliably than a wild grove does.
        farm.store = Math.min(30, farm.store + dt * 0.5);
        this.knowledge += dt * 0.03;
        if (t.taskTimer > 5) {
          t.emote = { icon: "spark", t: 1.2 };
          this.name(t, "food");
          t.task = "idle";
          t.thinkTimer = 0;
        }
        return;
      }
      case "stock": {
        const store = this.sites.find((s) => s.id === t.targetSite);
        if (!store || !store.complete) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        if (t.carryingFood > 0) {
          t.target = { x: store.x + 1.2, z: store.z + 1.0 };
          if (Math.hypot(store.x - t.x, store.z - t.z) < 2.4) {
            store.store += t.carryingFood;
            t.carryingFood = 0;
            t.emote = { icon: "apple", t: 1.2 };
            t.task = "idle";
            t.thinkTimer = 0;
          }
          return;
        }
        const tree = this.trees.find((tr) => tr.id === t.targetTree);
        if (!tree || tree.fruit <= 0) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        t.target = { x: tree.x + 0.9, z: tree.z + 0.6 };
        if (Math.hypot(tree.x - t.x, tree.z - t.z) > 1.8) return;
        t.taskTimer += dt;
        if (t.taskTimer > 1.6) {
          const take = Math.min(3, tree.fruit);
          tree.fruit -= take;
          t.carryingFood = take;
          t.taskTimer = 0;
          t.thought = "carrying it back.";
        }
        return;
      }
      case "trade": {
        const mine = this.clanOf(t);
        const them = this.clans.find((c) => c.id === t.partner);
        if (!mine || !them) {
          t.task = "idle";
          t.thinkTimer = 0;
          return;
        }
        // Load up at home, then walk it over.
        if (t.carryingFood <= 0) {
          const store = this.sites.find((s) => s.id === t.targetSite);
          if (!store || store.store <= 0) {
            t.task = "idle";
            t.thinkTimer = 0;
            return;
          }
          t.target = { x: store.x + 1.3, z: store.z + 1.1 };
          if (Math.hypot(store.x - t.x, store.z - t.z) > 2.4) return;
          const take = Math.min(4, Math.floor(store.store));
          store.store -= take;
          t.carryingFood = take;
          t.thought = `a gift for the ${them.name}.`;
          return;
        }

        t.target = { x: them.home.x, z: them.home.z };
        if (Math.hypot(them.home.x - t.x, them.home.z - t.z) > 3) return;

        // Delivered. Goodwill is the point; the food is the excuse.
        const theirStore = this.sites.find(
          (s) => s.complete && s.kind === "granary" && s.clanId === them.id,
        );
        if (theirStore) theirStore.store += t.carryingFood;
        them.traded += t.carryingFood;
        mine.traded += t.carryingFood;
        t.carryingFood = 0;
        t.emote = { icon: "heart", t: 1.8 };
        adjustRelation(mine, them, 0.09);
        this.knowledge += 2;
        this.tradeWordsBetween(mine, them);
        if (this.rand() < 0.5)
          this.addLog(
            `${t.name} carries food from the ${mine.name} to the ${them.name}.`,
            "trade",
          );
        t.task = "idle";
        t.thinkTimer = 0;
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
   * Two clans standing close enough to talk swap a word. It comes out of the
   * borrower's mouth changed, which is how neighbouring tongues end up with
   * words that are obviously related but no longer the same.
   */
  /**
   * One creature picks up a word from another simply by being there while it
   * is used. Within a clan this is how a coinage becomes everybody's word;
   * the clan lexicon holds the form, but knowing it is personal.
   */
  private overhear(listener: Thronglet, speaker: Thronglet) {
    const clan = this.clanOf(speaker);
    if (!clan) return;
    const fresh: Concept[] = [];
    for (const concept of Array.from(speaker.known)) {
      if (!listener.known.has(concept)) fresh.push(concept);
    }
    if (!fresh.length) return;
    const concept = pick(this.rand, fresh);
    if (this.rand() > 0.55) return;
    listener.known.add(concept);

    // Crossing a language boundary is how a word gets into another tongue.
    if (listener.clanId !== speaker.clanId) {
      const theirs = this.clanOf(listener);
      if (theirs) {
        const event = borrow(
          this.rand,
          { lex: clan.lexicon, name: clan.name },
          { lex: theirs.lexicon, phonology: theirs.phonology, name: theirs.name },
          concept,
        );
        if (event && this.rand() < 0.4)
          this.addLog(
            `The ${theirs.name} take “${event.word}” for ${concept} from the ${clan.name}.`,
            "word",
          );
      }
    } else if (this.rand() < 0.06) {
      const word = say(clan.lexicon, concept);
      if (word)
        this.addLog(
          `${listener.name} learns “${word}” from ${speaker.name}.`,
          "word",
        );
    }
  }

  private tradeWords(a: Thronglet, b: Thronglet) {
    const mine = this.clanOf(a);
    const theirs = this.clanOf(b);
    if (!mine || !theirs || mine.id === theirs.id) return;
    this.tradeWordsBetween(mine, theirs);
  }

  private tradeWordsBetween(mine: Clan, theirs: Clan) {
    const concept = pick(this.rand, CONCEPTS);
    const event = borrow(
      this.rand,
      { lex: theirs.lexicon, name: theirs.name },
      { lex: mine.lexicon, phonology: mine.phonology, name: mine.name },
      concept,
    );
    if (event && this.rand() < 0.3) {
      this.addLog(
        `The ${mine.name} take “${event.word}” for ${concept} from the ${theirs.name}.`,
        "word",
      );
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
    this.name(attacker, "fight");
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
      if (theirs) {
        theirs.losses++;
        theirs.lessons.raided++;
      }
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
    // Cooked food goes further, which is the whole point of having worked it out.
    if (
      this.clanOf(t)?.discoveries.has("cooking") &&
      this.warmthAt(t.x, t.z) > 0.3
    ) {
      amount *= 1.45;
    }
    const wasStarving = t.hunger > 0.85;
    this.name(t, "food");
    if (wasStarving) this.name(t, "hunger");
    t.hunger = Math.max(0, t.hunger - amount);
    t.joy = Math.max(0, t.joy - amount * 0.25);
    t.mealsEaten++;
    t.emote = { icon: "apple", t: 1.5 };

    // Somebody who has just eaten, in a place that is running out of fruit,
    // buries a seed. This is the colony's whole answer to famine.
    const clan = this.clanOf(t);
    if (clan && this.rand() < 0.12) {
      const nearby = this.trees.filter(
        (tr) => Math.hypot(tr.x - clan.home.x, tr.z - clan.home.z) < 26,
      );
      const bearing = nearby.filter((tr) => tr.fruit > 0).length;
      if (nearby.length < 14 || bearing < 4) {
        const spot = findLandSpot(this.rand, this.terrain, clan.home, 14);
        if (this.plantTree(spot.x, spot.z)) {
          t.emote = { icon: "spark", t: 1.4 };
          this.knowledge += 0.5;
          if (this.rand() < 0.25)
            this.addLog(`${t.name} buries a seed near the ${clan.name}.`, "grow");
        }
      }
    }
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

    // Wear the ground where they actually walk.
    if (moving > 0.4) {
      const key = wearKey(t.x, t.z);
      // Slow to accrue on purpose: only a route walked over and over should
      // ever go bare, or the whole village turns into a paved yard.
      this.wear.set(key, Math.min(3, (this.wear.get(key) ?? 0) + dt * 0.1));
    }
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

  /** The player has picked this one up. */
  pickUp(t: Thronglet) {
    t.held = true;
    t.task = "idle";
    t.target = null;
    t.foe = null;
    t.emote = { icon: "spark", t: 1.5 };
    t.thought = "whoa —";
    this.remember(t, "was lifted into the sky");
  }

  /**
   * Put down wherever the hand let go. Landing in water or on the far side of
   * the island is survivable; they just have to walk home.
   */
  putDown(t: Thronglet, x: number, z: number) {
    t.held = false;
    t.x = x;
    t.z = z;
    t.y = this.terrain.height(x, z);
    t.vx = 0;
    t.vz = 0;
    t.stuck = 0;
    t.thinkTimer = 0;
    t.hop = 1;

    const clan = this.clanOf(t);
    const far = clan ? Math.hypot(clan.home.x - x, clan.home.z - z) : 0;
    if (this.terrain.height(x, z) < WATER_LEVEL + 0.1) {
      t.thought = "cold. cold. out.";
      t.joy = Math.min(1, t.joy + 0.4);
      this.startTask(t, "flee");
    } else if (far > 22) {
      t.thought = "this is nowhere. go home.";
      t.task = "wander";
      t.target = { x: clan!.home.x, z: clan!.home.z };
    } else {
      t.thought = "…down.";
    }
    this.remember(t, "was set down somewhere new");
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
      kind: "apple",
      x,
      z,
      y,
      scale: 0.9,
      rot: this.rand() * Math.PI * 2,
      fruit: 2,
      capacity,
      regrow: 0,
      wood: TREE_TRAITS.apple.wood,
      fruitSlots,
    });
    return true;
  }
}
