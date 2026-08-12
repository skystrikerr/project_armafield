/**
 * The long climb.
 *
 * This is the part that makes the island a civilisation rather than a village
 * that gets bigger. Nothing here is unlocked by a timer or a progress bar the
 * player can watch tick: every technology is *worked at* by the people who
 * happen to be doing the relevant thing, and it takes as long as it takes.
 *
 * A technology accrues effort only while:
 *   1. its prerequisites are already known to that clan, and
 *   2. somebody is currently in the situation that would suggest it —
 *      freezing beside a woodpile, hungry at a fire, hauling a load too
 *      heavy, standing in a quarry, burying a third sibling.
 *
 * So a clan on easy ground climbs slowly, because nothing is pressing it, and
 * a clan on hard ground either invents its way out or dies. Effort is per
 * clan, which means two peoples on the same island can end up in different
 * centuries — and a friendly neighbour is worth more than a good quarry,
 * because you can be *taught*.
 */

export type Tech =
  // Wandering
  | "fire"
  | "knapping"
  | "burial"
  // Hearth
  | "cooking"
  | "baskets"
  | "weaving"
  // Settled
  | "sowing"
  | "pottery"
  | "masonry"
  // Craft
  | "kiln"
  | "wheel"
  | "numbers"
  // Forge
  | "smelting"
  | "writing"
  | "medicine"
  // Watching
  | "astronomy"
  | "law";

export type TechDef = {
  id: Tech;
  label: string;
  /** Which age this belongs to, 0-indexed. */
  era: number;
  /** Must all be known before any effort accrues. */
  needs: Tech[];
  /** Effort units required. Roughly: one unit per relevant act, or per
   *  second one member spends in the situation that suggests it. */
  cost: number;
  /** What the log says when somebody works it out. */
  story: string;
  /** One line for the tech panel: why the colony is better off. */
  effect: string;
  /** What pushes them towards it, for the panel. */
  pressure: string;
};

export const TECHS: TechDef[] = [
  {
    id: "fire",
    label: "fire",
    era: 0,
    needs: [],
    cost: 90,
    story: "works out fire on a bitter night.",
    effect: "Hearths. A winter night stops being fatal.",
    pressure: "Somebody awake and freezing with wood to hand.",
  },
  {
    id: "knapping",
    label: "knapping",
    era: 0,
    needs: [],
    cost: 150,
    story: "breaks a stone and keeps the sharp half.",
    effect: "Cutting edges: wood and stone come in a quarter faster.",
    pressure: "Time spent working a boulder with bare hands.",
  },
  {
    id: "burial",
    label: "burial",
    era: 0,
    needs: [],
    cost: 70,
    story: "stacks stones over the dead so the place is remembered.",
    effect: "Cairns where their people fell.",
    pressure: "Burying their own.",
  },

  {
    id: "cooking",
    label: "cooking",
    era: 1,
    needs: ["fire"],
    cost: 190,
    story: "holds food to the fire and finds it is better for it.",
    effect: "Food near a hearth goes half again as far.",
    pressure: "Going hungry within reach of a fire.",
  },
  {
    id: "baskets",
    label: "baskets",
    era: 1,
    needs: ["knapping"],
    cost: 250,
    story: "weaves something to carry more in.",
    effect: "Every trip hauls more.",
    pressure: "Carrying loads back and forth by the armful.",
  },
  {
    id: "weaving",
    label: "weaving",
    era: 1,
    needs: ["baskets"],
    cost: 340,
    story: "works out that what holds a load will also hold warmth.",
    effect: "They stop losing people to ordinary cold.",
    pressure: "Shivering indoors with the makings to hand.",
  },

  {
    id: "sowing",
    label: "sowing",
    era: 2,
    needs: ["cooking"],
    cost: 360,
    story: "notices the seeds they dropped last season came up in rows.",
    effect: "Grove plots. Tended ground beats a wild grove.",
    pressure: "Burying seed near the village, over and over.",
  },
  {
    id: "pottery",
    label: "pottery",
    era: 2,
    needs: ["fire", "knapping"],
    cost: 440,
    story: "bakes pond clay hard in the embers.",
    effect: "Granaries hold far more, and keep it longer.",
    pressure: "Working wet ground by the water with a fire in town.",
  },
  {
    id: "masonry",
    label: "masonry",
    era: 2,
    needs: ["knapping"],
    cost: 560,
    story: "cuts a stone so the next one sits flat on it.",
    effect: "Wells and watchtowers. Stone courses go up faster.",
    pressure: "Laying stone that will not stay where it is put.",
  },

  {
    id: "kiln",
    label: "the kiln",
    era: 3,
    needs: ["pottery", "masonry"],
    cost: 560,
    story: "walls a fire in so it will not let its heat go.",
    effect: "A kiln in town. Brick: everything is built quicker.",
    pressure: "Losing a firing to the weather.",
  },
  {
    id: "wheel",
    label: "the wheel",
    era: 3,
    needs: ["baskets", "masonry"],
    cost: 660,
    story: "rolls a load that has always been dragged.",
    effect: "Carts: bigger loads, and worn roads are worth walking.",
    pressure: "Long hauls, over and over, along the same line.",
  },
  {
    id: "numbers",
    label: "counting",
    era: 3,
    needs: ["pottery"],
    cost: 590,
    story: "scratches one mark per basket and finds they can be trusted.",
    effect: "Stores are kept honestly; caravans carry more.",
    pressure: "Stocking a granary and trading with strangers.",
  },

  {
    id: "smelting",
    label: "smelting",
    era: 4,
    needs: ["kiln"],
    cost: 800,
    story: "finds metal running out of a stone that was only meant to be hot.",
    effect: "A forge. Tools that hold an edge; work goes a third faster.",
    pressure: "Quarrying with a kiln already burning in town.",
  },
  {
    id: "writing",
    label: "writing",
    era: 4,
    needs: ["numbers", "masonry"],
    cost: 1000,
    story: "cuts a word into stone and finds it still there in the morning.",
    effect: "An archive. Every child is taught the whole tongue at once.",
    pressure: "Coining words, and raising things meant to outlast them.",
  },
  {
    id: "medicine",
    label: "medicine",
    era: 4,
    needs: ["weaving", "sowing"],
    cost: 760,
    story: "learns which leaf to press to a wound.",
    effect: "The hurt mend instead of dying.",
    pressure: "Sitting with the injured and the dying.",
  },

  {
    id: "astronomy",
    label: "astronomy",
    era: 5,
    needs: ["writing"],
    cost: 1180,
    story: "keeps a record of what is overhead, and notices it is not stars.",
    effect: "An observatory. They start looking back.",
    pressure: "Awake at night, once the throng suspects it is watched.",
  },
  {
    id: "law",
    label: "law",
    era: 5,
    needs: ["writing", "numbers"],
    cost: 1080,
    story: "writes down what is owed, so it stops being argued.",
    effect: "A hall. Clans hold together, and feuds end sooner.",
    pressure: "A people grown too big to agree with itself.",
  },
];

export const TECH_BY_ID = new Map<Tech, TechDef>(TECHS.map((t) => [t.id, t]));

/**
 * The ages. A clan is in an age once it holds every technology of the age
 * below it — so an age is a floor, not a badge, and a clan that skipped
 * something has to go back for it.
 */
export const ERAS: { name: string; blurb: string }[] = [
  { name: "Wandering", blurb: "shelterless, eating what they find" },
  { name: "Hearth", blurb: "fire kept, food cooked, loads carried" },
  { name: "Settled", blurb: "ground worked, stores raised, stone cut" },
  { name: "Craft", blurb: "kilns, carts and honest measures" },
  { name: "Forge", blurb: "metal, and words that outlive the speaker" },
  { name: "Watching", blurb: "they have begun to study the sky" },
];

export function techsOfEra(era: number) {
  return TECHS.filter((t) => t.era === era);
}

/** How far a clan has climbed: the highest age whose floor it has finished. */
export function eraOf(known: Set<Tech>): number {
  let era = 0;
  for (let e = 0; e < ERAS.length - 1; e++) {
    if (techsOfEra(e).every((t) => known.has(t.id))) era = e + 1;
    else break;
  }
  return era;
}

/**
 * Whether a clan could currently be working on this at all.
 *
 * Two gates, and the second one matters more than it looks. Prerequisites
 * alone are not enough: a technology also waits until its people have
 * actually finished the age below it. Without that, a clan that happened to
 * pick up counting early would be inventing writing while it still had
 * nothing to cook on — the ages stopped meaning anything, because everything
 * was reachable from everything. An age is a floor you stand on, not a label.
 */
export function reachable(known: Set<Tech>, id: Tech) {
  if (known.has(id)) return false;
  const def = TECH_BY_ID.get(id);
  if (!def) return false;
  if (def.era > eraOf(known)) return false;
  return def.needs.every((n) => known.has(n));
}

/** Everything a clan could be working on right now. */
export function frontier(known: Set<Tech>) {
  return TECHS.filter((t) => reachable(known, t.id));
}

/**
 * Being taught beats working it out, but not by as much as you would think —
 * a neighbour can show you a kiln, they cannot give you the years of firing
 * clay that make the kiln obvious.
 */
export const TEACH_RATE = 3.2;
