import { WEAPONS, type ClassId, type Soldier, type WeaponSpec } from "./units";

/**
 * Era and class data. `units.ts` and `combat.ts` only ever look up weapons by
 * id through the shared `WEAPONS` table — this module's job is to populate
 * that table with each era's roster and describe how classes draw from it.
 * Only WWII is populated; Cold War and Modern are registered as empty eras so
 * the switcher has somewhere to plug in later without touching this shape.
 */

export type EraId = "ww2" | "coldwar" | "modern";

export const ERA_LABEL: Record<EraId, string> = {
  ww2: "WWII",
  coldwar: "Cold War",
  modern: "Modern",
};

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

/** Player-selectable classes for the deploy screen. */
export const PLAYABLE_CLASSES: ClassDef[] = WW2_CLASSES.filter((c) => !c.aiOnly);

type EraDef = { weapons: Partial<Record<string, WeaponSpec>>; classes: ClassDef[] };

const EMPTY_ERA: EraDef = { weapons: {}, classes: [] };

export const ERAS: Record<EraId, EraDef> = {
  ww2: { weapons: WW2_WEAPONS, classes: WW2_CLASSES },
  coldwar: EMPTY_ERA,
  modern: EMPTY_ERA,
};

export const CURRENT_ERA: EraId = "ww2";

// Merge every era's roster into the shared WEAPONS table at load time, so
// combat.ts and ai.ts can keep resolving weapons with a single generic
// `WEAPONS[id]` lookup and never need to import this module.
for (const era of Object.values(ERAS)) {
  Object.assign(WEAPONS, era.weapons);
}

export function classById(id: ClassId): ClassDef {
  const found = WW2_CLASSES.find((c) => c.id === id);
  if (!found) throw new Error(`ironfront: unknown class "${id}"`);
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
export function primaryOptionsFor(classId: ClassId): string[] {
  const cls = classById(classId);
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
  const cls = classById(classId);
  const loadout = cls.loadout.map((defaultId, slot) => {
    if (slot === 0 && primaryOverride) return primaryOverride;
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
