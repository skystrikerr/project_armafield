/**
 * The part that makes them people rather than agents.
 *
 * Up to here a thronglet related to the world — food, water, wood, a shrine —
 * and to its clan as an abstraction. It did not relate to *anybody*. Two
 * creatures who had spent their whole lives beside each other were strangers,
 * and a death was a decrement.
 *
 * This module gives each one a handful of specific other people it knows and
 * has feelings about, built out of things that actually happened between them:
 * who fed it when it was starving, who it grew up beside, who struck it, whose
 * children are also its children. Those bonds then feed back into behaviour —
 * who it walks across the village to talk to, who it hands its last apple to,
 * who it grieves — and upward into how whole peoples treat each other.
 *
 * Two design rules, both learned the hard way from the rest of this sim:
 *
 *   1. Nothing here is a global mood. Every number is attached to a named
 *      individual and a remembered event, because "the Ashgate hate the
 *      Fenwold" is not a fact about a people, it is an average over what its
 *      members have each had done to them.
 *   2. Bonds are capped and cheap. A creature holds eight relationships, not
 *      five hundred. Real people do the same thing, and it keeps this O(1).
 */

/** How many other people one creature can hold in mind at once. */
export const BOND_CAP = 8;

export type BondKind =
  | "kin" // parent, child or sibling
  | "friend"
  | "mate"
  | "rival"
  | "enemy";

export type Bond = {
  id: number;
  name: string;
  /** −1 (would not spit on them) … +1 (would die for them). */
  affinity: number;
  kind: BondKind;
  /** The specific thing that set this bond, for the inspector. */
  because: string;
  /** Sim time of the last thing that passed between them. */
  last: number;
};

/**
 * Find or make the bond one creature holds towards another, evicting the
 * weakest and stalest bond when there is no room. Forgetting the acquaintance
 * you last spoke to nine days ago in favour of the person in front of you is
 * the right behaviour, not a limitation.
 */
export function bondWith(
  bonds: Bond[],
  id: number,
  name: string,
  now: number,
): Bond {
  const found = bonds.find((b) => b.id === id);
  if (found) {
    found.last = now;
    return found;
  }
  const bond: Bond = {
    id,
    name,
    affinity: 0,
    kind: "friend",
    because: "we have met",
    last: now,
  };
  if (bonds.length >= BOND_CAP) {
    // Evict whoever matters least: weak feeling, long silence.
    let worst = 0;
    let worstScore = Infinity;
    for (let i = 0; i < bonds.length; i++) {
      const b = bonds[i];
      const score = Math.abs(b.affinity) * 60 + b.last;
      if (score < worstScore) {
        worstScore = score;
        worst = i;
      }
    }
    bonds[worst] = bond;
  } else {
    bonds.push(bond);
  }
  return bond;
}

/** Move a bond, and let its label follow the feeling. */
export function nudgeBond(
  b: Bond,
  delta: number,
  because: string,
  now: number,
) {
  b.affinity = Math.max(-1, Math.min(1, b.affinity + delta));
  b.because = because;
  b.last = now;
  // Kin and mates keep their label whatever they think of each other —
  // your brother is your brother even when you cannot stand him.
  if (b.kind === "kin" || b.kind === "mate") return;
  b.kind =
    b.affinity <= -0.6
      ? "enemy"
      : b.affinity <= -0.2
        ? "rival"
        : "friend";
}

export function bondTo(bonds: Bond[], id: number) {
  return bonds.find((b) => b.id === id) ?? null;
}

/**
 * How much this one is thought of — the thing that decides who a people
 * listens to. It is earned, not assigned: feeding the hungry, raising
 * children, laying stone, working something out, and outliving your
 * generation all count. Killing counts too, and differently.
 */
export type Standing = {
  fed: number;
  raised: number;
  built: number;
  worked: number;
  killed: number;
};

export function standingScore(s: Standing, ageDays: number) {
  return (
    s.fed * 3 +
    s.raised * 6 +
    s.built * 0.35 +
    s.worked * 22 +
    s.killed * 4 +
    Math.min(12, ageDays * 1.5)
  );
}

/* ------------------------------------------------------------------ */
/* Grievance — why peoples actually fight                              */
/* ------------------------------------------------------------------ */

/**
 * A remembered injury done by one people to another.
 *
 * War used to come out of a drifting number: two clans whose relation score
 * wandered below a threshold "took up stones", which meant the island could
 * be at war on day four over nothing anybody could name. A war should be the
 * end of a long argument, so it is built out of specific things instead —
 * each with a date, a name and a weight — and it takes an accumulation of
 * them, plus a society organised enough to field warriors, before anyone
 * marches.
 */
export type GrievanceKind =
  | "killing"
  | "raid"
  | "theft"
  | "conversion"
  | "crowding"
  | "heresy";

export type Grievance = {
  kind: GrievanceKind;
  /** Which clan did it. */
  by: number;
  /** Who did it and who it was done to, where there are names to give. */
  who: string | null;
  victim: string | null;
  day: number;
  weight: number;
};

export const GRIEVANCE_WEIGHT: Record<GrievanceKind, number> = {
  killing: 1,
  raid: 0.45,
  theft: 0.3,
  conversion: 0.22,
  crowding: 0.12,
  heresy: 0.18,
};

/** How grievance reads in the record. */
export function grievanceLine(g: Grievance, byName: string) {
  switch (g.kind) {
    case "killing":
      return `${g.who ?? "someone"} of the ${byName} killed ${g.victim ?? "one of ours"} (day ${g.day})`;
    case "raid":
      return `the ${byName} came for our stones (day ${g.day})`;
    case "theft":
      return `the ${byName} took from our store (day ${g.day})`;
    case "conversion":
      return `the ${byName} took ${g.victim ?? "one of ours"} from our god (day ${g.day})`;
    case "crowding":
      return `the ${byName} settled on top of us (day ${g.day})`;
    case "heresy":
      return `the ${byName} say our god wrong (day ${g.day})`;
  }
}

/**
 * Grievances fade. Not to nothing — a killing is remembered for a long
 * time — but a people that is left alone for a season stops counting.
 */
export function decayGrievances(list: Grievance[], dt: number) {
  for (const g of list) {
    // A death is remembered roughly four times as long as a slight.
    const life = g.kind === "killing" ? 900 : 260;
    g.weight -= (GRIEVANCE_WEIGHT[g.kind] / life) * dt;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].weight <= 0.01) list.splice(i, 1);
  }
}

export function grievanceTotal(list: Grievance[], against: number) {
  let sum = 0;
  for (const g of list) if (g.by === against) sum += Math.max(0, g.weight);
  return sum;
}

/**
 * How much accumulated injury it takes before a people will march, and the
 * age it has to have reached to organise it.
 *
 * Organised violence is a late thing. A wandering band that resents its
 * neighbours shoves and shouts; it does not muster. Requiring the age of
 * Craft — kilns, carts, kept accounts, a people organised enough to send
 * fifteen of its own somewhere and feed them when they get there — is what
 * keeps the first war weeks away instead of days.
 */
/**
 * Set this against what a peaceful island can actually accumulate. Killings
 * are the heaviest grievance by far, but killings only happen during raids
 * and raids only happen during wars — so if the bar sits above what crowding,
 * heresy and poaching can reach on their own, the first war can never start
 * and the island stays permanently, unnaturally calm. The bar has to be
 * reachable by peacetime friction alone, and only just.
 */
export const WAR_GRIEVANCE = 1.6;
export const WAR_MIN_ERA = 3;
/** Below this the feud is over and they go back to muttering. */
export const PEACE_GRIEVANCE = 0.8;
