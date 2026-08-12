import { pick, range, type Rand } from "./random";
import { makePhonology, type Lexicon, type Phonology } from "./language";

/**
 * Clans and the things they believe.
 *
 * A clan is a village, a bloodline pool and a faith rolled together. Faith is
 * what makes clans behave like peoples rather than teams: it decides who they
 * try to convert, what they gather around at dawn, and who they eventually
 * come to blows with.
 */

/**
 * Things a people can work out for itself. Each is invented by one individual
 * under a specific pressure — fire on a cold night, burial after enough
 * graves — rather than unlocked by a counter.
 */
export type Discovery = "fire" | "cooking" | "baskets" | "burial";

export const DISCOVERY_LABEL: Record<Discovery, string> = {
  fire: "fire",
  cooking: "cooking",
  baskets: "baskets",
  burial: "burial",
};

export type SacredThing = "sun" | "water" | "grove" | "stone" | "throng" | "egg";

export type Faith = {
  id: number;
  deity: string;
  sacred: SacredThing;
  creed: string;
  /** How hard the faith pushes outward — conversion, and holy war. */
  zeal: number;
  /** Set when a faith broke away from another one. */
  heresyOf: number | null;
};

export type Clan = {
  id: number;
  name: string;
  color: number;
  faith: Faith;
  home: { x: number; z: number };
  founded: number;
  /** Recomputed each tick from living members. */
  members: number;
  /** clanId → -1 (blood feud) … +1 (kin). */
  relations: Map<number, number>;
  raids: number;
  losses: number;
  converts: number;
  /** The sound system this clan's words are drawn from. */
  phonology: Phonology;
  /** Everything they have found a word for. */
  lexicon: Lexicon;
  /**
   * What this clan has learned the hard way. Each is a count of the deaths or
   * raids that taught it, and each biases what they build next.
   */
  lessons: { thirst: number; famine: number; raided: number };
  /** Daughter settlements: extra centres this clan builds around. */
  outposts: { x: number; z: number }[];
  /** What they call each of their towns, in their own tongue. */
  townNames: string[];
  /** Goods carried in from other clans — the trade that isn't war. */
  traded: number;
  /** Things this people has worked out, and who worked each one out. */
  discoveries: Map<Discovery, { by: string; day: number }>;
};

const CLAN_HEAD = [
  "Ash",
  "Bram",
  "Cinder",
  "Dun",
  "Fen",
  "Glim",
  "Hollow",
  "Mar",
  "Nix",
  "Ors",
  "Pell",
  "Quill",
  "Rook",
  "Sallow",
  "Tarn",
  "Vell",
  "Wick",
  "Yarrow",
];
const CLAN_TAIL = [
  "fen",
  "cairn",
  "hollow",
  "reach",
  "mire",
  "bough",
  "stead",
  "wold",
  "gate",
  "brook",
  "spire",
  "hearth",
];

const DEITY_HEAD = [
  "Om",
  "Ka",
  "Zu",
  "Nen",
  "Thal",
  "Ur",
  "Vesh",
  "Ix",
  "Mor",
  "Aya",
  "Rhu",
  "Sib",
];
const DEITY_TAIL = ["mu", "na", "ra", "eth", "is", "ok", "ai", "un", "ess", "ol"];

export const CLAN_COLORS = [
  0xe86a5c, // ember
  0x5cc7e8, // tide
  0x9be85c, // moss
  0xc98ce8, // heather
  0xe8c65c, // amber
  0x5ce8a8, // verdigris
  0xe85ca4, // thistle
  0x7d8ce8, // dusk
  0xe8a15c, // clay
  0x5ce8d8, // shallow
  0xb8e85c, // lichen
  0xe85c5c, // rust
];

/** Fallback creeds — an LLM can overwrite these when one is connected. */
const CREEDS: Record<SacredThing, string[]> = {
  sun: [
    "The light counts us at dawn. Be counted.",
    "Nothing done in the dark is finished.",
  ],
  water: [
    "What is poured returns. Give freely.",
    "Still water remembers every face.",
  ],
  grove: [
    "Every apple is a promise kept.",
    "Plant for the ones who have not hatched.",
  ],
  stone: [
    "Stack what outlasts you.",
    "A wall is an argument that holds.",
  ],
  throng: [
    "One mind, many mouths.",
    "What one learns, all of us keep.",
  ],
  egg: [
    "The unhatched are owed everything.",
    "Guard the shell and the rest follows.",
  ],
};

const SACRED: SacredThing[] = ["sun", "water", "grove", "stone", "throng", "egg"];

export function clanName(rand: Rand) {
  return `${pick(rand, CLAN_HEAD)}${pick(rand, CLAN_TAIL)}`;
}

export function deityName(rand: Rand) {
  return `${pick(rand, DEITY_HEAD)}${pick(rand, DEITY_TAIL)}`;
}

export function makeFaith(rand: Rand, id: number, heresyOf: number | null = null): Faith {
  const sacred = pick(rand, SACRED);
  return {
    id,
    deity: deityName(rand),
    sacred,
    creed: pick(rand, CREEDS[sacred]),
    zeal: range(rand, 0.2, 0.85),
    heresyOf,
  };
}

/**
 * A breakaway faith: same shape, sharper edges. Heresies run hotter than the
 * orthodoxy they left, which is what makes schisms turn into feuds.
 */
export function splinterFaith(rand: Rand, id: number, parent: Faith): Faith {
  const keepsSacred = rand() < 0.45;
  const sacred = keepsSacred ? parent.sacred : pick(rand, SACRED);
  return {
    id,
    // Only the first breakaway gets to be "the Unspoken" — after that a
    // heresy has to find its own god rather than stacking epithets.
    deity:
      rand() < 0.5 && !parent.deity.includes(" the ")
        ? `${parent.deity} the Unspoken`
        : deityName(rand),
    sacred,
    creed: pick(rand, CREEDS[sacred]),
    zeal: Math.min(1, parent.zeal + range(rand, 0.1, 0.35)),
    heresyOf: parent.id,
  };
}

export function makeClan(
  rand: Rand,
  id: number,
  home: { x: number; z: number },
  faith: Faith,
  founded: number,
): Clan {
  return {
    id,
    name: clanName(rand),
    color: CLAN_COLORS[(id - 1) % CLAN_COLORS.length],
    faith,
    home,
    founded,
    members: 0,
    relations: new Map(),
    raids: 0,
    losses: 0,
    converts: 0,
    phonology: makePhonology(rand),
    lexicon: new Map(),
    lessons: { thirst: 0, famine: 0, raided: 0 },
    outposts: [],
    townNames: [],
    traded: 0,
    discoveries: new Map(),
  };
}

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export function relationOf(a: Clan, b: Clan) {
  if (a.id === b.id) return 1;
  return a.relations.get(b.id) ?? 0;
}

export function adjustRelation(a: Clan, b: Clan, delta: number) {
  if (a.id === b.id) return;
  const next = Math.max(-1, Math.min(1, relationOf(a, b) + delta));
  a.relations.set(b.id, next);
  b.relations.set(a.id, next);
}

export const WAR_THRESHOLD = -0.72;
export const PEACE_THRESHOLD = -0.15;

export function atWar(a: Clan, b: Clan) {
  return a.id !== b.id && relationOf(a, b) <= WAR_THRESHOLD;
}

/**
 * Slow background drift. Shared faith pulls clans together; rival gods and
 * villages built on top of each other push them apart. Nothing here fires an
 * event — it just sets the weather that raids happen in.
 */
export function driftRelations(clans: Clan[], dt: number) {
  for (let i = 0; i < clans.length; i++) {
    for (let j = i + 1; j < clans.length; j++) {
      const a = clans[i];
      const b = clans[j];
      const sameGod = a.faith.id === b.faith.id;
      const heresy =
        a.faith.heresyOf === b.faith.id || b.faith.heresyOf === a.faith.id;
      const zeal = (a.faith.zeal + b.faith.zeal) / 2;

      let delta = 0;
      if (sameGod) delta += 0.028;
      else if (heresy) delta -= 0.016 * zeal;
      else delta -= 0.006 * zeal;

      // Crowding: villages within a few strides of each other rub badly.
      const gap = Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z);
      if (gap < 22) delta -= (1 - gap / 22) * 0.014;
      else delta += 0.006;

      adjustRelation(a, b, delta * dt);
    }
  }
}

/** Human-readable standing, for the HUD. */
export function relationLabel(v: number) {
  if (v <= WAR_THRESHOLD) return "at war";
  if (v <= -0.2) return "hostile";
  if (v < 0.2) return "wary";
  if (v < 0.6) return "friendly";
  return "kin";
}
