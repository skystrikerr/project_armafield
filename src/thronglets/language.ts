import { pick, range, type Rand } from "./random";

/**
 * Invented languages.
 *
 * Each clan gets its own sound system when it is founded, and coins words as
 * its members run into things worth naming. Words spread when clans meet, and
 * mutate as they travel, so a borrowed word drifts away from the one it came
 * from. Nothing here is authored: given long enough, neighbouring villages end
 * up with recognisably related words for water and completely unrelated ones
 * for god.
 */

export type Concept =
  | "food"
  | "water"
  | "home"
  | "sleep"
  | "friend"
  | "stranger"
  | "child"
  | "death"
  | "god"
  | "build"
  | "wood"
  | "play"
  | "fight"
  | "hunger"
  | "stone"
  | "town";

export const CONCEPTS: Concept[] = [
  "food",
  "water",
  "home",
  "sleep",
  "friend",
  "stranger",
  "child",
  "death",
  "god",
  "build",
  "wood",
  "play",
  "fight",
  "hunger",
  "stone",
  "town",
];

/** What each concept means, for the glosses in the UI. */
export const CONCEPT_GLOSS: Record<Concept, string> = {
  food: "food",
  water: "water",
  home: "home",
  sleep: "sleep",
  friend: "friend",
  stranger: "stranger",
  child: "child",
  death: "death",
  god: "god",
  build: "to build",
  wood: "wood",
  play: "play",
  fight: "to fight",
  hunger: "hunger",
  stone: "stone",
  town: "town",
};

const ONSETS = [
  "b", "d", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z",
  "th", "sh", "kr", "gl", "br", "tr", "nd", "ng", "fl", "sk", "vr",
];
const VOWELS = ["a", "e", "i", "o", "u", "aa", "ee", "oo", "ai", "ou", "y"];
const CODAS = ["", "", "", "k", "m", "n", "p", "t", "l", "sh", "ng", "r", "x"];

/** The sound system a clan draws its words from. */
export type Phonology = {
  onsets: string[];
  vowels: string[];
  codas: string[];
  /** Most words are this many syllables. */
  syllables: number;
};

export function makePhonology(rand: Rand): Phonology {
  const take = <T,>(pool: readonly T[], n: number) => {
    const out: T[] = [];
    const left = [...pool];
    for (let i = 0; i < n && left.length; i++) {
      out.push(left.splice(Math.floor(rand() * left.length), 1)[0]);
    }
    return out;
  };
  return {
    onsets: take(ONSETS, 5 + Math.floor(rand() * 4)),
    vowels: take(VOWELS, 3 + Math.floor(rand() * 3)),
    codas: take(CODAS, 4 + Math.floor(rand() * 3)),
    syllables: rand() < 0.55 ? 2 : rand() < 0.85 ? 1 : 3,
  };
}

export function coinWord(rand: Rand, p: Phonology) {
  const count = Math.max(1, p.syllables + (rand() < 0.25 ? 1 : 0));
  let word = "";
  for (let i = 0; i < count; i++) {
    word += pick(rand, p.onsets) + pick(rand, p.vowels);
    if (i === count - 1 || rand() < 0.3) word += pick(rand, p.codas);
  }
  return word;
}

/**
 * A word as it travels: what it sounds like, how firmly the clan holds it, and
 * who first said it.
 */
export type Word = {
  word: string;
  /** 0..1 — how established. Reinforced by use, weakened by rival forms. */
  strength: number;
  coinedBy: string;
  /** The clan it was borrowed from, if it wasn't coined here. */
  borrowedFrom: string | null;
};

export type Lexicon = Map<Concept, Word>;

/** Sound change: what happens to a word in somebody else's mouth. */
export function mutate(rand: Rand, word: string, p: Phonology) {
  if (word.length < 2) return word;
  const roll = rand();
  if (roll < 0.35) {
    // Swap a vowel for one this clan actually uses.
    const v = pick(rand, p.vowels);
    return word.replace(/[aeiouy]+/, v);
  }
  if (roll < 0.6) {
    // Lose the ending.
    return word.replace(/[a-z]$/, pick(rand, p.codas));
  }
  if (roll < 0.8) {
    // Harden or soften the first sound.
    return pick(rand, p.onsets) + word.slice(1);
  }
  // Reduplicate a syllable — a very common way for words to grow.
  return word + word.slice(-2);
}

export type SpeechEvent = {
  concept: Concept;
  word: string;
  /** "coined" when it is brand new, "borrowed" when it came from elsewhere. */
  kind: "coined" | "borrowed";
  from: string | null;
};

/**
 * Name something this clan has no word for yet. Returns the event so the
 * caller can decide whether it is worth a line in the log.
 */
export function coin(
  rand: Rand,
  lex: Lexicon,
  p: Phonology,
  concept: Concept,
  speaker: string,
): SpeechEvent | null {
  if (lex.has(concept)) return null;
  const word = coinWord(rand, p);
  lex.set(concept, {
    word,
    strength: range(rand, 0.3, 0.55),
    coinedBy: speaker,
    borrowedFrom: null,
  });
  return { concept, word, kind: "coined", from: null };
}

/** Using a word makes it stick. */
export function reinforce(lex: Lexicon, concept: Concept, amount = 0.04) {
  const w = lex.get(concept);
  if (w) w.strength = Math.min(1, w.strength + amount);
}

/**
 * One clan hears another's word for something. They take it if they have no
 * word of their own, or if theirs is weakly held — and it comes out changed.
 */
export function borrow(
  rand: Rand,
  theirs: { lex: Lexicon; name: string },
  ours: { lex: Lexicon; phonology: Phonology; name: string },
  concept: Concept,
): SpeechEvent | null {
  const source = theirs.lex.get(concept);
  if (!source) return null;

  const held = ours.lex.get(concept);
  if (held && held.strength > source.strength * 0.75) {
    // We have a firm word for it; hearing theirs only makes ours firmer.
    held.strength = Math.min(1, held.strength + 0.02);
    return null;
  }

  const word = rand() < 0.75 ? mutate(rand, source.word, ours.phonology) : source.word;
  if (held && held.word === word) return null;

  ours.lex.set(concept, {
    word,
    strength: Math.max(0.25, source.strength * 0.7),
    coinedBy: source.coinedBy,
    borrowedFrom: theirs.name,
  });
  return { concept, word, kind: "borrowed", from: theirs.name };
}

/** The word for something, if they have one. */
export function say(lex: Lexicon, concept: Concept) {
  return lex.get(concept)?.word ?? null;
}

/** Render a thought in their own tongue where they have the words for it. */
export function inTongue(lex: Lexicon, text: string, concept: Concept | null) {
  if (!concept) return text;
  const w = say(lex, concept);
  return w ? `${text} «${w}»` : text;
}

/**
 * How far two clans' tongues have drifted apart: 0 is the same language, 1 is
 * mutually unintelligible.
 */
export function distance(a: Lexicon, b: Lexicon) {
  let shared = 0;
  let compared = 0;
  for (const concept of CONCEPTS) {
    const x = a.get(concept);
    const y = b.get(concept);
    if (!x || !y) continue;
    compared++;
    if (x.word === y.word) shared += 1;
    else if (x.word.slice(0, 2) === y.word.slice(0, 2)) shared += 0.5;
  }
  if (!compared) return 1;
  return 1 - shared / compared;
}
