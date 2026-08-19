import { WEAPONS, type ClassId, type Soldier, type Team, type WeaponSpec } from "./units";
import { WW2_ARSENALS } from "./arsenals";

/**
 * Era and class data. `units.ts` and `combat.ts` only ever look up weapons by
 * id through the shared `WEAPONS` table — this module's job is to populate
 * that table with each era's roster and describe how classes draw from it.
 * WWI and WWII are populated; Cold War and Modern are registered as empty eras
 * so the switcher has somewhere to plug in later without touching this shape.
 */

export type EraId = "ww1" | "ww2" | "coldwar" | "modern";

export const ERA_LABEL: Record<EraId, string> = {
  ww1: "WWI",
  ww2: "WWII",
  coldwar: "Cold War",
  modern: "Modern",
};

/* ================================================================== */
/*  Nations                                                             */
/* ================================================================== */

/**
 * The combatant a team represents. This is what picks the roster: a UK team
 * flies Spitfires and Lancasters, a Japanese team flies Zeros. Which side of
 * the war a nation is on only decides team colour and who shoots at whom.
 */
export type Nation = "usa" | "uk" | "ussr" | "germany" | "japan" | "britain_ww1" | "germany_ww1";

export type Side = "allies" | "axis";

export const NATION_LABEL: Record<Nation, string> = {
  usa: "United States",
  uk: "United Kingdom",
  ussr: "Soviet Union",
  germany: "Germany",
  japan: "Japan",
  britain_ww1: "British Empire",
  germany_ww1: "Central Powers",
};

/** Short form for the HUD and team tabs, where the full name will not fit. */
export const NATION_SHORT: Record<Nation, string> = {
  usa: "USA",
  uk: "UK",
  ussr: "USSR",
  germany: "Germany",
  japan: "Japan",
  britain_ww1: "Britain",
  germany_ww1: "Central",
};

export const SIDE_OF: Record<Nation, Side> = {
  usa: "allies",
  uk: "allies",
  ussr: "allies",
  germany: "axis",
  japan: "axis",
  britain_ww1: "allies",
  germany_ww1: "axis",
};

/** Which nations a given era fields, in the order the picker lists them. */
export const NATIONS_OF_ERA: Record<EraId, Nation[]> = {
  ww1: ["britain_ww1", "germany_ww1"],
  ww2: ["usa", "uk", "ussr", "germany", "japan"],
  coldwar: [],
  modern: [],
};

/** Default matchup a fresh era opens on. */
export function defaultNations(era: EraId): { team1: Nation; team2: Nation } {
  const list = NATIONS_OF_ERA[era];
  const allies = list.find((n) => SIDE_OF[n] === "allies") ?? list[0];
  const axis = list.find((n) => SIDE_OF[n] === "axis") ?? list[list.length - 1];
  return { team1: allies, team2: axis };
}

export type ClassDef = {
  id: ClassId;
  name: string;
  description: string;
  /** Default weapon ids, in the order number keys select them. Index 0 is the primary. */
  loadout: string[];
  /**
   * Alternate weapon ids a given slot may carry instead of its default —
   * a Panzerfaust or an AT rifle in the Support's second slot, say. Slot 0's
   * options are offered to the player on the deploy screen; every other
   * slot with options rolls a random pick each time a soldier is equipped,
   * so AI squads carry a mixed loadout rather than a uniform one.
   */
  slotOptions: Record<number, string[]>;
  /** Spare magazines carried per weapon id, on top of the one loaded. */
  reserve: Record<string, number>;
  grenades: number;
  speedMul: number;
  staminaMul: number;
  /** AI squads only field this class today; not yet offered to the player. */
  aiOnly?: boolean;
};

/** What the low-poly rig should show for a weapon it has no dedicated mesh for yet. */
export type WeaponCategory = "rifle" | "smg" | "lmg" | "marksman" | "heavy" | "sidearm";

/**
 * Extends the base WeaponSpec with the fields infantry-feel needs: a kick per
 * shot that recovers over time, idle aim drift, and how much either eases off
 * while aiming down sights. Vehicle weapons leave these at their defaults.
 */
const WW2_WEAPONS: Record<string, WeaponSpec> = {
  bolt_rifle: {
    name: "Kar Rifle",
    rpm: 40,
    speed: 500,
    damage: 55,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.006,
    magazine: 5,
    reloadTime: 3.2,
    auto: false,
    tracer: 0xffd08a,
    category: "rifle",
    recoilKick: 0.05,
    recoilRecover: 4.5,
    swayAmount: 0.006,
    adsZoom: 1.6,
    adsSwayMul: 0.35,
  },
  garand_rifle: {
    name: "Semi Rifle",
    rpm: 180,
    speed: 480,
    damage: 42,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.007,
    magazine: 8,
    reloadTime: 2.6,
    auto: false,
    tracer: 0xffd08a,
    category: "rifle",
    recoilKick: 0.038,
    recoilRecover: 5,
    swayAmount: 0.0065,
    adsZoom: 1.6,
    adsSwayMul: 0.4,
  },
  smg: {
    name: "SMG",
    rpm: 650,
    speed: 320,
    damage: 22,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.02,
    magazine: 32,
    reloadTime: 2.2,
    auto: true,
    tracer: 0xffd08a,
    category: "smg",
    recoilKick: 0.018,
    recoilRecover: 7,
    swayAmount: 0.01,
    adsZoom: 1.15,
    adsSwayMul: 0.5,
  },
  smg_drum: {
    name: "Drum SMG",
    rpm: 750,
    speed: 300,
    damage: 20,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.024,
    magazine: 71,
    reloadTime: 3.4,
    auto: true,
    tracer: 0xffd08a,
    category: "smg",
    recoilKick: 0.015,
    recoilRecover: 6.5,
    swayAmount: 0.012,
    adsZoom: 1.1,
    adsSwayMul: 0.55,
  },
  lmg: {
    name: "LMG",
    rpm: 500,
    speed: 460,
    damage: 32,
    penetration: 4,
    blast: 0,
    blastDamage: 0,
    spread: 0.016,
    magazine: 50,
    reloadTime: 5.5,
    auto: true,
    tracer: 0xffd08a,
    category: "lmg",
    recoilKick: 0.026,
    recoilRecover: 3.5,
    swayAmount: 0.02,
    adsZoom: 1.1,
    adsSwayMul: 0.6,
  },
  lmg_light: {
    name: "Light MG",
    rpm: 420,
    speed: 460,
    damage: 30,
    penetration: 3,
    blast: 0,
    blastDamage: 0,
    spread: 0.012,
    magazine: 20,
    reloadTime: 3.0,
    auto: true,
    tracer: 0xffd08a,
    category: "lmg",
    recoilKick: 0.022,
    recoilRecover: 4.2,
    swayAmount: 0.014,
    adsZoom: 1.15,
    adsSwayMul: 0.5,
  },
  marksman_rifle: {
    name: "Scoped Rifle",
    rpm: 35,
    speed: 520,
    damage: 70,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.003,
    magazine: 5,
    reloadTime: 3.0,
    auto: false,
    tracer: 0xffd08a,
    category: "marksman",
    recoilKick: 0.06,
    recoilRecover: 3.2,
    swayAmount: 0.008,
    adsZoom: 4.0,
    adsSwayMul: 0.15,
  },
  marksman_semi: {
    name: "Semi Scoped Rifle",
    rpm: 150,
    speed: 500,
    damage: 52,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.0045,
    magazine: 10,
    reloadTime: 2.8,
    auto: false,
    tracer: 0xffd08a,
    category: "marksman",
    recoilKick: 0.04,
    recoilRecover: 4.2,
    swayAmount: 0.009,
    adsZoom: 2.5,
    adsSwayMul: 0.25,
  },
  panzerfaust: {
    name: "Panzerfaust",
    rpm: 20,
    speed: 105,
    damage: 90,
    penetration: 210,
    blast: 6,
    blastDamage: 85,
    spread: 0.006,
    magazine: 1,
    reloadTime: 4.5,
    auto: false,
    tracer: 0xffb347,
    category: "heavy",
    recoilKick: 0.1,
    recoilRecover: 2,
    swayAmount: 0.012,
    adsZoom: 1.3,
    adsSwayMul: 0.5,
  },
  at_rifle: {
    name: "AT Rifle",
    rpm: 25,
    speed: 380,
    damage: 45,
    penetration: 90,
    blast: 0,
    blastDamage: 0,
    spread: 0.005,
    magazine: 5,
    reloadTime: 3.2,
    auto: false,
    tracer: 0xffb347,
    category: "heavy",
    recoilKick: 0.08,
    recoilRecover: 2.8,
    swayAmount: 0.014,
    adsZoom: 1.8,
    adsSwayMul: 0.4,
  },
  pistol: {
    name: "Pistol",
    rpm: 300,
    speed: 260,
    damage: 18,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.018,
    magazine: 8,
    reloadTime: 1.6,
    auto: false,
    tracer: 0xffd08a,
    category: "sidearm",
    recoilKick: 0.03,
    recoilRecover: 6,
    swayAmount: 0.014,
    adsZoom: 1.2,
    adsSwayMul: 0.55,
  },
  revolver: {
    name: "Revolver",
    rpm: 180,
    speed: 280,
    damage: 32,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.014,
    magazine: 6,
    reloadTime: 2.4,
    auto: false,
    tracer: 0xffd08a,
    category: "sidearm",
    recoilKick: 0.045,
    recoilRecover: 5,
    swayAmount: 0.012,
    adsZoom: 1.2,
    adsSwayMul: 0.55,
  },
};

const WW2_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A bolt or semi-auto rifle, and a sidearm. The baseline.",
    loadout: ["bolt_rifle", "pistol"],
    slotOptions: { 0: ["bolt_rifle", "garand_rifle"], 1: ["pistol", "revolver"] },
    reserve: { bolt_rifle: 6, garand_rifle: 5, pistol: 2, revolver: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "An SMG and a sidearm. Close-range volume of fire, faster on foot.",
    loadout: ["smg", "pistol"],
    slotOptions: { 0: ["smg", "smg_drum"], 1: ["pistol", "revolver"] },
    reserve: { smg: 5, smg_drum: 3, pistol: 2, revolver: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "A machine gun, an AT weapon, and a sidearm. The squad's answer to armour.",
    loadout: ["lmg", "panzerfaust", "pistol"],
    slotOptions: {
      0: ["lmg", "lmg_light"],
      1: ["panzerfaust", "at_rifle"],
      2: ["pistol", "revolver"],
    },
    reserve: { lmg: 2, lmg_light: 3, panzerfaust: 1, at_rifle: 2, pistol: 2, revolver: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["marksman_rifle", "pistol"],
    slotOptions: { 0: ["marksman_rifle", "marksman_semi"], 1: ["pistol", "revolver"] },
    reserve: { marksman_rifle: 6, marksman_semi: 4, pistol: 2, revolver: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "An SMG and a sidearm. Leads the squad's push. AI-only for now.",
    loadout: ["smg", "pistol"],
    slotOptions: { 0: ["smg", "smg_drum"], 1: ["pistol", "revolver"] },
    reserve: { smg: 5, smg_drum: 3, pistol: 2, revolver: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
    aiOnly: true,
  },
];


/* ================================================================== */
/*  Great War                                                          */
/* ================================================================== */

/**
 * 1917 infantry. Everything is slower, heavier and holds fewer rounds than
 * its 1944 equivalent: bolt rifles with long strokes, one blowback SMG that
 * only arrived at the very end, and machine guns that need a crew and a
 * tripod. There is no shoulder-fired anti-tank weapon, because there wasn't
 * one — armour is answered with a bolt-action AT rifle or a grenade bundle.
 */
const WW1_WEAPONS: Record<string, WeaponSpec> = {
  smle_rifle: {
    name: "SMLE",
    rpm: 45,
    speed: 490,
    damage: 56,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.0058,
    magazine: 10,
    reloadTime: 4.4,
    auto: false,
    tracer: 0xffd08a,
    category: "rifle",
    recoilKick: 0.052,
    recoilRecover: 4.3,
    swayAmount: 0.0065,
    adsZoom: 1.6,
    adsSwayMul: 0.35,
  },
  gewehr98: {
    name: "Gewehr 98",
    rpm: 36,
    speed: 520,
    damage: 60,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.0052,
    magazine: 5,
    reloadTime: 3.6,
    auto: false,
    tracer: 0xffd08a,
    category: "rifle",
    recoilKick: 0.058,
    recoilRecover: 4.1,
    swayAmount: 0.0062,
    adsZoom: 1.7,
    adsSwayMul: 0.33,
  },
  mp18: {
    name: "MP 18",
    rpm: 420,
    speed: 380,
    damage: 26,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.026,
    magazine: 32,
    reloadTime: 3.4,
    auto: true,
    tracer: 0xffd08a,
    category: "smg",
    recoilKick: 0.019,
    recoilRecover: 8,
    swayAmount: 0.009,
    adsZoom: 1.15,
    adsSwayMul: 0.5,
  },
  /** Trench shotgun. Murderous inside a bay, useless past it. */
  trench_gun: {
    name: "Trench Gun",
    rpm: 75,
    speed: 300,
    damage: 74,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.055,
    magazine: 6,
    reloadTime: 4.8,
    auto: false,
    tracer: 0xffc890,
    category: "smg",
    recoilKick: 0.075,
    recoilRecover: 5,
    swayAmount: 0.008,
    adsZoom: 1.1,
    adsSwayMul: 0.6,
  },
  lewis_gun: {
    name: "Lewis Gun",
    rpm: 550,
    speed: 460,
    damage: 34,
    penetration: 2,
    blast: 0,
    blastDamage: 0,
    spread: 0.019,
    magazine: 47,
    reloadTime: 5.6,
    auto: true,
    tracer: 0xffd08a,
    category: "lmg",
    recoilKick: 0.016,
    recoilRecover: 7,
    swayAmount: 0.013,
    adsZoom: 1.2,
    adsSwayMul: 0.55,
  },
  mg08_15: {
    name: "MG 08/15",
    rpm: 480,
    speed: 470,
    damage: 36,
    penetration: 3,
    blast: 0,
    blastDamage: 0,
    spread: 0.021,
    magazine: 100,
    reloadTime: 7,
    auto: true,
    tracer: 0xffd08a,
    category: "lmg",
    recoilKick: 0.015,
    recoilRecover: 6.5,
    swayAmount: 0.016,
    adsZoom: 1.15,
    adsSwayMul: 0.6,
  },
  /** Scoped Gewehr. The war's sniping was done with iron-sight rifles and these. */
  scoped_gewehr: {
    name: "Scoped Gewehr",
    rpm: 30,
    speed: 540,
    damage: 88,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.0016,
    magazine: 5,
    reloadTime: 3.8,
    auto: false,
    tracer: 0xffd08a,
    category: "marksman",
    recoilKick: 0.062,
    recoilRecover: 3.6,
    swayAmount: 0.0042,
    adsZoom: 4.2,
    adsSwayMul: 0.16,
  },
  /** 13 mm anti-tank rifle. One shot, both shoulders, and it does open a Mark IV. */
  tankgewehr: {
    name: "Tankgewehr",
    rpm: 12,
    speed: 560,
    damage: 95,
    penetration: 22,
    blast: 0,
    blastDamage: 0,
    spread: 0.005,
    magazine: 1,
    reloadTime: 4.6,
    auto: false,
    tracer: 0xffe0b0,
    category: "heavy",
    recoilKick: 0.16,
    recoilRecover: 2.4,
    swayAmount: 0.02,
    adsZoom: 2.4,
    adsSwayMul: 0.3,
  },
  /** Bundled stick grenades, thrown against a track. Short range, real punch. */
  grenade_bundle: {
    name: "Grenade Bundle",
    rpm: 20,
    speed: 26,
    damage: 60,
    penetration: 26,
    blast: 6,
    blastDamage: 190,
    spread: 0.02,
    magazine: 1,
    reloadTime: 4.2,
    auto: false,
    tracer: 0x8a8f7a,
    category: "heavy",
    recoilKick: 0.03,
    recoilRecover: 5,
    swayAmount: 0.012,
    adsZoom: 1,
    adsSwayMul: 1,
  },
  webley: {
    name: "Webley",
    rpm: 110,
    speed: 300,
    damage: 34,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.02,
    magazine: 6,
    reloadTime: 2.6,
    auto: false,
    tracer: 0xffd08a,
    category: "sidearm",
    recoilKick: 0.038,
    recoilRecover: 7,
    swayAmount: 0.012,
    adsZoom: 1.1,
    adsSwayMul: 0.6,
  },
  luger: {
    name: "Luger",
    rpm: 150,
    speed: 330,
    damage: 28,
    penetration: 0,
    blast: 0,
    blastDamage: 0,
    spread: 0.018,
    magazine: 8,
    reloadTime: 2.3,
    auto: false,
    tracer: 0xffd08a,
    category: "sidearm",
    recoilKick: 0.03,
    recoilRecover: 8,
    swayAmount: 0.011,
    adsZoom: 1.1,
    adsSwayMul: 0.6,
  },
};

const WW1_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A bolt rifle and a revolver. Ten rounds if you took the SMLE.",
    loadout: ["smle_rifle", "webley"],
    slotOptions: { 0: ["smle_rifle", "gewehr98"], 1: ["webley", "luger"] },
    reserve: { smle_rifle: 6, gewehr98: 7, webley: 2, luger: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Trench Raider",
    description: "An MP 18 or a trench gun. Built for clearing a bay at arm's length.",
    loadout: ["mp18", "webley"],
    slotOptions: { 0: ["mp18", "trench_gun"], 1: ["webley", "luger"] },
    reserve: { mp18: 4, trench_gun: 5, webley: 2, luger: 2 },
    grenades: 4,
    speedMul: 1.06,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "A crew-served automatic and something that opens armour.",
    loadout: ["lewis_gun", "tankgewehr", "webley"],
    slotOptions: {
      0: ["lewis_gun", "mg08_15"],
      1: ["tankgewehr", "grenade_bundle"],
      2: ["webley", "luger"],
    },
    reserve: { lewis_gun: 3, mg08_15: 2, tankgewehr: 5, grenade_bundle: 2, webley: 2, luger: 2 },
    grenades: 1,
    speedMul: 0.88,
    staminaMul: 0.86,
  },
  {
    id: "marksman",
    name: "Sniper",
    description: "A scoped Gewehr. Slow, precise, and the best reach on the field.",
    loadout: ["scoped_gewehr", "webley"],
    slotOptions: { 0: ["scoped_gewehr"], 1: ["webley", "luger"] },
    reserve: { scoped_gewehr: 6, webley: 2, luger: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A revolver and a whistle. Leads from the parapet.",
    loadout: ["webley", "smle_rifle"],
    slotOptions: { 0: ["webley", "luger"], 1: ["smle_rifle", "gewehr98"] },
    reserve: { webley: 4, luger: 4, smle_rifle: 3, gewehr98: 3 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/**
 * The era the current match is being fought in. A match runs one era at a
 * time, so this is set once from the match settings before anything spawns and
 * then read by every class and weapon lookup below. It is module state rather
 * than a parameter threaded through every call site because the alternative is
 * passing an era id into `classById` from a dozen places that have no other
 * reason to know about eras.
 */
let activeEra: EraId = "ww2";

/**
 * Which nation each side is fighting as. Set once from the match settings
 * before anything spawns, then read by every class, weapon and grenade lookup
 * below — a British rifleman has to end up with a Lee-Enfield and a German one
 * with a Kar98k, and the only thing a `Soldier` carries is its team colour.
 */
let teamNations: Record<Team, Nation> = { blue: "usa", red: "germany" };

export function setActiveEra(era: EraId) {
  if (ERAS[era].classes.length === 0) {
    throw new Error(`ironfront: era "${era}" has no classes registered`);
  }
  activeEra = era;
}

export function setTeamNations(nations: Record<Team, Nation>) {
  teamNations = { ...nations };
}

export function getActiveEra(): EraId {
  return activeEra;
}

export function nationOfTeam(team: Team): Nation {
  return teamNations[team];
}

/** The nation the player is fighting as. The player is always on blue. */
export function playerNation(): Nation {
  return teamNations.blue;
}

/**
 * A nation's own arsenal, or null for one that has not been given one — the
 * two Great War sides still draw from their era's shared roster.
 */
export function arsenalFor(nation: Nation) {
  return WW2_ARSENALS[nation] ?? null;
}

/** Which era a nation belongs to. */
export function eraOfNation(nation: Nation): EraId {
  for (const era of Object.keys(NATIONS_OF_ERA) as EraId[]) {
    if (NATIONS_OF_ERA[era].includes(nation)) return era;
  }
  return "ww2";
}

/** Every class this nation fields, player-facing and AI-only alike. */
export function classesForNation(nation: Nation): ClassDef[] {
  return arsenalFor(nation)?.classes ?? ERAS[eraOfNation(nation)].classes;
}

/** The grenade this nation throws. */
export function grenadeOfNation(nation: Nation): string {
  return arsenalFor(nation)?.grenade ?? "grenade";
}

/** Every class in the era currently selected, player-facing and AI-only alike. */
export function classesOfEra(era: EraId = activeEra): ClassDef[] {
  return ERAS[era].classes;
}

/** Player-selectable classes for the deploy screen, for the player's nation. */
export function playableClasses(nation: Nation = playerNation()): ClassDef[] {
  return classesForNation(nation).filter((c) => !c.aiOnly);
}


type EraDef = { weapons: Partial<Record<string, WeaponSpec>>; classes: ClassDef[] };

const EMPTY_ERA: EraDef = { weapons: {}, classes: [] };

export const ERAS: Record<EraId, EraDef> = {
  ww1: { weapons: WW1_WEAPONS, classes: WW1_CLASSES },
  ww2: { weapons: WW2_WEAPONS, classes: WW2_CLASSES },
  coldwar: EMPTY_ERA,
  modern: EMPTY_ERA,
};

/** Eras that are actually playable — the empty placeholders are filtered out. */
export const AVAILABLE_ERAS: EraId[] = (Object.keys(ERAS) as EraId[]).filter(
  (e) => ERAS[e].classes.length > 0,
);

export const CURRENT_ERA: EraId = "ww2";

// Merge every era's roster into the shared WEAPONS table at load time, so
// combat.ts and ai.ts can keep resolving weapons with a single generic
// `WEAPONS[id]` lookup and never need to import this module.
for (const era of Object.values(ERAS)) {
  Object.assign(WEAPONS, era.weapons);
}
for (const arsenal of Object.values(WW2_ARSENALS)) {
  Object.assign(WEAPONS, arsenal.weapons);
}

export function classById(id: ClassId, nation: Nation = playerNation()): ClassDef {
  const found = classesForNation(nation).find((c) => c.id === id);
  if (!found) throw new Error(`ironfront: unknown class "${id}" for ${nation}`);
  return found;
}

/** Squad composition an AI-controlled team spawns with, by slot index. */
const SQUAD_TEMPLATE: ClassId[] = [
  "officer",
  "rifleman", "rifleman", "rifleman", "rifleman", "rifleman",
  "assault", "assault", "assault",
  "support", "support",
  "marksman", "marksman",
];

export function squadClassFor(index: number): ClassId {
  return SQUAD_TEMPLATE[index % SQUAD_TEMPLATE.length];
}

export function weaponCategory(weaponId: string): WeaponCategory {
  return (WEAPONS[weaponId]?.category as WeaponCategory | undefined) ?? "rifle";
}

/** Primary-weapon choices offered on the deploy screen for a given class. */
export function primaryOptionsFor(classId: ClassId, nation: Nation = playerNation()): string[] {
  const cls = classById(classId, nation);
  return cls.slotOptions[0] ?? [cls.loadout[0]];
}

/**
 * Fits a class's loadout onto a soldier. `primaryOverride` picks slot 0 (the
 * player's choice on the deploy screen); every other slot with alternatives
 * rolls one at random, so two soldiers of the same class rarely carry an
 * identical kit. Call this once right after `makeSoldier` — nothing reads
 * `weapon`/`loadout` before a soldier has taken its first frame, so there's
 * no state in between.
 */
export function equipSoldier(s: Soldier, classId: ClassId, primaryOverride?: string) {
  // The soldier's own side decides which army's kit it draws — this is what
  // stops a Japanese squad spawning with Thompsons.
  const nation = nationOfTeam(s.team);
  const cls = classById(classId, nation);
  const options0 = cls.slotOptions[0] ?? [cls.loadout[0]];
  const loadout = cls.loadout.map((defaultId, slot) => {
    // Only honour an override this army actually issues.
    if (slot === 0 && primaryOverride && options0.includes(primaryOverride)) return primaryOverride;
    const options = cls.slotOptions[slot];
    if (options && options.length > 1) return options[Math.floor(Math.random() * options.length)];
    return defaultId;
  });
  s.classId = cls.id;
  s.loadout = loadout;
  s.weapon = loadout[0];
  s.ammo = {};
  s.mags = {};
  for (const id of loadout) {
    s.ammo[id] = WEAPONS[id].magazine;
    s.mags[id] = cls.reserve[id] ?? 2;
  }
  s.grenades = cls.grenades;
}

/** Weapon id of whichever AT/heavy weapon this soldier is actually carrying, if any. */
export function heavyWeaponOfSoldier(s: Soldier): string | null {
  return s.loadout.find((id) => weaponCategory(id) === "heavy") ?? null;
}
