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
  /** Weapon ids, in the order number keys select them. Index 0 is the primary. */
  loadout: string[];
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

type Ww2WeaponId =
  | "bolt_rifle"
  | "smg"
  | "lmg"
  | "marksman_rifle"
  | "panzerfaust"
  | "pistol";

/**
 * Extends the base WeaponSpec with the fields infantry-feel needs: a kick per
 * shot that recovers over time, idle aim drift, and how much either eases off
 * while aiming down sights. Vehicle weapons leave these at their defaults.
 */
const WW2_WEAPONS: Record<Ww2WeaponId, WeaponSpec> = {
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
};

const WW2_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "Kar rifle and pistol. The baseline — hits hard, cycles slow.",
    loadout: ["bolt_rifle", "pistol"],
    reserve: { bolt_rifle: 6, pistol: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "SMG and pistol. Close-range volume of fire, faster on foot.",
    loadout: ["smg", "pistol"],
    reserve: { smg: 5, pistol: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "LMG, a Panzerfaust, and a pistol. The squad's answer to armour.",
    loadout: ["lmg", "panzerfaust", "pistol"],
    reserve: { lmg: 2, panzerfaust: 1, pistol: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "Scoped rifle and pistol. Stays back, picks targets at range.",
    loadout: ["marksman_rifle", "pistol"],
    reserve: { marksman_rifle: 6, pistol: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "SMG and pistol. Leads the squad's push. AI-only for now.",
    loadout: ["smg", "pistol"],
    reserve: { smg: 5, pistol: 2 },
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

/**
 * Fits a class's loadout onto a soldier: primary weapon equipped, every
 * carried weapon loaded and stocked with its reserve magazines. Call this
 * once right after `makeSoldier` — nothing reads `weapon`/`loadout` before
 * a soldier has taken its first frame, so there's no state in between.
 */
export function equipSoldier(s: Soldier, classId: ClassId) {
  const cls = classById(classId);
  s.classId = cls.id;
  s.loadout = [...cls.loadout];
  s.weapon = cls.loadout[0];
  s.ammo = {};
  s.mags = {};
  for (const id of cls.loadout) {
    const spec = WEAPONS[id];
    s.ammo[id] = spec.magazine;
    s.mags[id] = cls.reserve[id] ?? 2;
  }
  s.grenades = cls.grenades;
}

/** Weapon id of the class's AT/heavy weapon, if it carries one. */
export function heavyWeaponOf(classId: ClassId): string | null {
  const cls = classById(classId);
  return cls.loadout.find((id) => weaponCategory(id) === "heavy") ?? null;
}

