import type { Team } from "./units";

/**
 * Match configuration: the vehicle/weapon catalog, per-team loadouts, map list
 * and presets, plus the state manager the setup screen binds to.
 *
 * This is the single source of truth for *what may spawn*. The spawner in
 * game.ts asks this module what a team is allowed to field; it never hardcodes
 * a vehicle again. Adding a vehicle is a data edit here plus a mesh in
 * vehicleModels.ts — no changes to spawn logic, AI or combat.
 */

/* ================================================================== */
/*  Chassis taxonomy                                                    */
/* ================================================================== */

/**
 * How a vehicle behaves, independent of which nation fielded it. Drives the
 * physics profile, whether it has a traversing turret, and which mesh builder
 * is used. Two vehicles sharing a chassis differ only by stats and colour.
 */
export type Chassis =
  | "light_car" // open-top 4x4 scout — Jeep, Kübelwagen
  | "motorcycle" // 2 wheels + sidecar, fastest thing on the map
  | "truck" // 6x6 cargo hauler, big troop capacity, no armour
  | "amphibious" // truck that floats — DUKW
  | "halftrack" // wheels front, tracks rear; light armour, carries a squad
  | "armored_car" // wheeled, small turret, light armour — M8 Greyhound
  | "medium_tank" // turret, balanced — Sherman, Panzer IV
  | "heavy_tank" // turret, thick armour, slow — Tiger I
  | "tank_destroyer" // casemate hull, no turret, limited traverse — StuG III
  | "fighter"; // propeller aircraft

/** Broad grouping used by the setup UI's category rows and Select-All buttons. */
export type VehicleCategory = "light" | "transport" | "armor" | "air";

export const CATEGORY_LABEL: Record<VehicleCategory, string> = {
  light: "Light Vehicles",
  transport: "Transports",
  armor: "Armor",
  air: "Aircraft",
};

/** Which side historically fielded a vehicle. "both" = available to either team. */
export type Faction = "allies" | "axis" | "both";

/**
 * Armour thickness per plate, in millimetres, before impact angle is applied.
 * The combat model divides these by the cosine of the strike angle, so a
 * sloped Sherman glacis defeats shot that would punch through the same
 * thickness set square-on. Unarmoured vehicles use very low values so rifle
 * fire genuinely kills them.
 */
export type ArmorScheme = {
  hullFront: number;
  hullSide: number;
  hullRear: number;
  hullTop: number;
  turretFront: number;
  turretSide: number;
  turretRear: number;
  turretTop: number;
};

/** Mobility profile. Speeds are world units per second (roughly m/s). */
export type Mobility = {
  maxSpeed: number;
  reverseSpeed: number;
  accel: number;
  turnRate: number;
  /** Turret traverse in rad/s. 0 for turretless hulls. */
  turretTraverse: number;
  /**
   * Max turret deflection from centre, in radians. Math.PI means a full
   * 360° turret; a casemate tank destroyer gets a narrow arc instead.
   */
  turretArc: number;
};

export type VehicleDef = {
  id: string;
  /** Short label for the HUD and kill feed. */
  name: string;
  /** Full historical designation, shown in the setup screen. */
  displayName: string;
  chassis: Chassis;
  category: VehicleCategory;
  faction: Faction;
  hp: number;
  armor: ArmorScheme;
  mobility: Mobility;
  /** Weapon ids from the shared WEAPONS table. Empty = unarmed. */
  weapons: string[];
  /** Main-gun shell loadout, if this vehicle has a cannon. */
  ammo?: { ap: number; he: number };
  /** Troops it can carry besides the driver. */
  passengerSeats: number;
  /** Body colour, overriding the team tint — Axis grey vs khaki, etc. */
  tint: number;
  /** Approximate triangle budget, kept as documentation for the mesh builder. */
  triangles: number;
  /** One-line description for the setup screen tooltip. */
  blurb: string;
};

/* ================================================================== */
/*  Armour presets                                                      */
/* ================================================================== */

/** Soft-skin: rifle rounds go straight through. */
const UNARMORED: ArmorScheme = {
  hullFront: 3, hullSide: 2, hullRear: 2, hullTop: 1,
  turretFront: 3, turretSide: 2, turretRear: 2, turretTop: 1,
};

const LIGHT_ARMOR: ArmorScheme = {
  hullFront: 15, hullSide: 8, hullRear: 8, hullTop: 6,
  turretFront: 19, turretSide: 13, turretRear: 13, turretTop: 6,
};

const MEDIUM_ARMOR: ArmorScheme = {
  hullFront: 76, hullSide: 38, hullRear: 38, hullTop: 19,
  turretFront: 89, turretSide: 51, turretRear: 51, turretTop: 19,
};

const HEAVY_ARMOR: ArmorScheme = {
  hullFront: 102, hullSide: 82, hullRear: 82, hullTop: 26,
  turretFront: 120, turretSide: 82, turretRear: 82, turretTop: 26,
};

/* ================================================================== */
/*  Vehicle catalog — the twelve from the reference sheet, plus air     */
/* ================================================================== */

export const VEHICLES: VehicleDef[] = [
  /* ---------- Light vehicles ---------- */
  {
    id: "willys_jeep",
    name: "Jeep",
    displayName: "Willys MB Jeep",
    chassis: "light_car",
    category: "light",
    faction: "allies",
    hp: 45,
    armor: UNARMORED,
    mobility: { maxSpeed: 24, reverseSpeed: 8, accel: 14, turnRate: 1.9, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 3,
    tint: 0x5a6338, // olive drab
    triangles: 180,
    blurb: "Fast open scout car. No protection whatsoever — speed is the armour.",
  },
  {
    id: "kubelwagen",
    name: "Kübel",
    displayName: "Kübelwagen",
    chassis: "light_car",
    category: "light",
    faction: "axis",
    hp: 45,
    armor: UNARMORED,
    mobility: { maxSpeed: 23, reverseSpeed: 8, accel: 13.5, turnRate: 1.95, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 3,
    tint: 0x7a6f4a, // khaki
    triangles: 170,
    blurb: "The Axis scout car. Slightly nimbler than the Jeep, just as fragile.",
  },
  {
    id: "motorcycle_sidecar",
    name: "Motorcycle",
    displayName: "Motorcycle with Sidecar",
    chassis: "motorcycle",
    category: "light",
    faction: "axis",
    hp: 28,
    armor: UNARMORED,
    mobility: { maxSpeed: 30, reverseSpeed: 5, accel: 18, turnRate: 2.4, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 1,
    tint: 0x6d6444,
    triangles: 200,
    blurb: "The fastest thing on the map, and the easiest to kill. One passenger in the sidecar.",
  },

  /* ---------- Transports ---------- */
  {
    id: "gmc_cckw",
    name: "GMC Truck",
    displayName: "GMC CCKW 353 Truck",
    chassis: "truck",
    category: "transport",
    faction: "allies",
    hp: 80,
    armor: UNARMORED,
    mobility: { maxSpeed: 17, reverseSpeed: 6, accel: 7, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x5a6338,
    triangles: 420,
    blurb: "Six-wheel hauler. Moves a whole squad, but a soft target the entire way.",
  },
  {
    id: "opel_blitz",
    name: "Opel Blitz",
    displayName: "Opel Blitz Truck",
    chassis: "truck",
    category: "transport",
    faction: "axis",
    hp: 80,
    armor: UNARMORED,
    mobility: { maxSpeed: 18, reverseSpeed: 6, accel: 7.2, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x7a6f4a,
    triangles: 400,
    blurb: "Canvas-topped Axis squad truck. Fractionally quicker than the GMC.",
  },
  {
    id: "dukw",
    name: "DUKW",
    displayName: "GMC DUKW Amphibious Truck",
    chassis: "amphibious",
    category: "transport",
    faction: "allies",
    hp: 90,
    armor: UNARMORED,
    mobility: { maxSpeed: 15, reverseSpeed: 5, accel: 6, turnRate: 0.9, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x5a6338,
    triangles: 430,
    blurb: "Boat-hulled truck that crosses water other vehicles have to drive around.",
  },
  {
    id: "sdkfz_251",
    name: "Half-track",
    displayName: "SdKfz 251 Half-track",
    chassis: "halftrack",
    category: "transport",
    faction: "axis",
    hp: 120,
    armor: LIGHT_ARMOR,
    mobility: { maxSpeed: 16, reverseSpeed: 6, accel: 7, turnRate: 1.05, turretTraverse: 0, turretArc: 0 },
    weapons: ["coax"],
    passengerSeats: 6,
    tint: 0x4a4d4a, // dark gray
    triangles: 460,
    blurb: "Armoured squad carrier with a pintle MG. Shrugs off rifle fire, not cannon.",
  },

  /* ---------- Armor ---------- */
  {
    id: "m8_greyhound",
    name: "Greyhound",
    displayName: "M8 Greyhound Armored Car",
    chassis: "armored_car",
    category: "armor",
    faction: "allies",
    hp: 130,
    armor: LIGHT_ARMOR,
    mobility: { maxSpeed: 21, reverseSpeed: 8, accel: 9, turnRate: 1.4, turretTraverse: 0.6, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 30, he: 30 },
    passengerSeats: 2,
    tint: 0x5a6338,
    triangles: 380,
    blurb: "Wheeled turret car. Fast enough to flank, thin enough that anything armoured wins.",
  },
  {
    id: "m4_sherman",
    name: "Sherman",
    displayName: "M4 Sherman Tank",
    chassis: "medium_tank",
    category: "armor",
    faction: "allies",
    hp: 200,
    armor: MEDIUM_ARMOR,
    mobility: { maxSpeed: 12.5, reverseSpeed: 5.5, accel: 5.2, turnRate: 0.72, turretTraverse: 0.55, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 42, he: 24 },
    passengerSeats: 0,
    tint: 0x5a6338,
    triangles: 550,
    blurb: "The Allied workhorse. Sloped glacis, fast turret, dies to a Tiger at range.",
  },
  {
    id: "panzer_iv",
    name: "Panzer IV",
    displayName: "Panzer IV Ausf. H",
    chassis: "medium_tank",
    category: "armor",
    faction: "axis",
    hp: 195,
    armor: {
      ...MEDIUM_ARMOR,
      hullFront: 80, // thicker but flat — no slope bonus
      turretFront: 50,
    },
    mobility: { maxSpeed: 13, reverseSpeed: 5.5, accel: 5.4, turnRate: 0.74, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 40, he: 26 },
    passengerSeats: 0,
    tint: 0x4a4d4a,
    triangles: 580,
    blurb: "Thick flat plate and a good gun. Angle the hull or the slope advantage is lost.",
  },
  {
    id: "tiger_i",
    name: "Tiger",
    displayName: "Tiger I",
    chassis: "heavy_tank",
    category: "armor",
    faction: "axis",
    hp: 300,
    armor: HEAVY_ARMOR,
    mobility: { maxSpeed: 9.5, reverseSpeed: 4, accel: 3.4, turnRate: 0.5, turretTraverse: 0.32, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 50, he: 20 },
    passengerSeats: 0,
    tint: 0x4a4d4a,
    triangles: 650,
    blurb: "Bounces most of what the Allies field. Slow, and that turret takes an age to come round.",
  },
  {
    id: "stug_iii",
    name: "StuG III",
    displayName: "StuG III Ausf. G",
    chassis: "tank_destroyer",
    category: "armor",
    faction: "axis",
    hp: 185,
    armor: { ...MEDIUM_ARMOR, hullFront: 80, turretFront: 80 },
    mobility: {
      maxSpeed: 12,
      reverseSpeed: 6,
      accel: 5,
      turnRate: 0.7,
      turretTraverse: 0.35,
      // Casemate: the gun sits in the hull, so aiming means turning the whole
      // vehicle. This narrow arc is what makes it play differently to a tank.
      turretArc: 0.22,
    },
    weapons: ["cannon", "coax"],
    ammo: { ap: 44, he: 22 },
    passengerSeats: 0,
    tint: 0x4a4d4a,
    triangles: 520,
    blurb: "Turretless ambusher. Low, well protected, but must point its whole hull to aim.",
  },

  /* ---------- Aircraft ---------- */
  {
    id: "fighter_allied",
    name: "Fighter",
    displayName: "Allied Fighter",
    chassis: "fighter",
    category: "air",
    faction: "allies",
    hp: 100,
    armor: UNARMORED,
    mobility: { maxSpeed: 118, reverseSpeed: 0, accel: 10, turnRate: 1.2, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x4a6b8a,
    triangles: 600,
    blurb: "Propeller fighter with 20 mm cannon and two bombs.",
  },
  {
    id: "fighter_axis",
    name: "Fighter",
    displayName: "Axis Fighter",
    chassis: "fighter",
    category: "air",
    faction: "axis",
    hp: 100,
    armor: UNARMORED,
    mobility: { maxSpeed: 120, reverseSpeed: 0, accel: 10, turnRate: 1.25, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x8a5240,
    triangles: 600,
    blurb: "Propeller fighter with 20 mm cannon and two bombs.",
  },
];

/** Fast id lookup. Throws loudly rather than returning undefined silently. */
const VEHICLE_BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

export function vehicleById(id: string): VehicleDef {
  const v = VEHICLE_BY_ID.get(id);
  if (!v) throw new Error(`matchConfig: unknown vehicle "${id}"`);
  return v;
}

/**
 * Mobility and armour for a spawned vehicle, by catalog id.
 *
 * The simulation reads these instead of the old global TANK_* constants, which
 * is what makes a Tiger crawl and bounce shots while a Greyhound sprints and
 * dies to anything. Both return the catalog's own objects — callers must treat
 * them as read-only.
 */
export function mobilityOf(defId: string): Mobility {
  return vehicleById(defId).mobility;
}

export function armorOf(defId: string): ArmorScheme {
  return vehicleById(defId).armor;
}

/** Every vehicle a given side is allowed to field (its own plus shared ones). */
export function vehiclesForFaction(faction: "allies" | "axis"): VehicleDef[] {
  return VEHICLES.filter((v) => v.faction === faction || v.faction === "both");
}

export function vehiclesInCategory(faction: "allies" | "axis", category: VehicleCategory): VehicleDef[] {
  return vehiclesForFaction(faction).filter((v) => v.category === category);
}

/* ================================================================== */
/*  Weapon catalog grouping (weapon stats live in eras.ts)              */
/* ================================================================== */

/** Setup-screen grouping for the infantry weapons registered by eras.ts. */
export type WeaponGroup = "rifles" | "smgs" | "machine_guns" | "anti_tank" | "sidearms";

export const WEAPON_GROUP_LABEL: Record<WeaponGroup, string> = {
  rifles: "Rifles",
  smgs: "SMGs",
  machine_guns: "Machine Guns",
  anti_tank: "Anti-Tank",
  sidearms: "Sidearms",
};

/**
 * Which infantry weapons sit in which setup-screen group. Ids match the WWII
 * roster in eras.ts; a new era adds its ids here to appear in the menu.
 */
export const WEAPON_GROUPS: Record<WeaponGroup, string[]> = {
  rifles: ["bolt_rifle", "garand_rifle", "marksman_rifle", "marksman_semi"],
  smgs: ["smg", "smg_drum"],
  machine_guns: ["lmg", "lmg_light"],
  anti_tank: ["panzerfaust", "at_rifle"],
  sidearms: ["pistol", "revolver"],
};

export const ALL_WEAPON_IDS: string[] = Object.values(WEAPON_GROUPS).flat();

/* ================================================================== */
/*  Maps                                                                */
/* ================================================================== */

export type MapDef = {
  id: string;
  name: string;
  /** Terrain generation seed — the same seed always builds the same ground. */
  seed: number;
  blurb: string;
  /** Rough feel, shown as a tag in the map picker. */
  tags: string[];
  /**
   * The loadout this map starts out configured with. Bocage is hedgerow
   * country, so it opens on infantry; the steppe opens on armour. The player
   * can change any of it — this is only what they find when they first
   * select the map.
   */
  defaultPreset: PresetId;
};

export const MAPS: MapDef[] = [
  {
    id: "valley",
    name: "Valley Sector",
    seed: 1337,
    blurb: "Three villages along a road through a shallow valley. Mixed arms.",
    tags: ["Balanced", "3 Points"],
    defaultPreset: "all_out",
  },
  {
    id: "bocage",
    name: "Bocage",
    seed: 90210,
    blurb: "Tight hedgerows and sunken lanes. Infantry country — armour gets ambushed.",
    tags: ["Close", "Infantry"],
    defaultPreset: "infantry_only",
  },
  {
    id: "steppe",
    name: "Open Steppe",
    seed: 4242,
    blurb: "Long sightlines and almost no cover. Tank and aircraft ground.",
    tags: ["Open", "Armor"],
    defaultPreset: "armor_clash",
  },
  {
    id: "coast",
    name: "Coastal Airfield",
    seed: 7777,
    blurb: "Airstrips, water crossings and a beach. Favours aircraft and amphibians.",
    tags: ["Air", "Water"],
    defaultPreset: "air_superiority",
  },
];

export function mapById(id: string): MapDef {
  const m = MAPS.find((x) => x.id === id);
  if (!m) throw new Error(`matchConfig: unknown map "${id}"`);
  return m;
}

/* ================================================================== */
/*  Team loadouts                                                       */
/* ================================================================== */

export type TeamLoadout = {
  /** Display name — "Eagle"/"Raven" in Ravenfield terms, Allies/Axis here. */
  label: string;
  faction: "allies" | "axis";
  /** Which engine team colour this side renders as. */
  team: Team;
  enabledWeapons: string[];
  enabledVehicles: string[];
  botCount: number;
  tickets: number;
  /** 0 = harmless, 1 = unpleasant. Feeds the AI accuracy/reaction model. */
  skill: number;
};

export type MatchSettings = {
  mapId: string;
  seed: number;
  teams: { team1: TeamLoadout; team2: TeamLoadout };
};

/* ================================================================== */
/*  Presets                                                             */
/* ================================================================== */

export type PresetId = "all_out" | "ww2_historical" | "infantry_only" | "armor_clash" | "air_superiority";

export type Preset = {
  id: PresetId;
  name: string;
  blurb: string;
  /**
   * Builds this preset's two team loadouts. A preset is a template applied to
   * whichever map is being configured — it never changes the map itself, so
   * you can put Armor Clash on the bocage if you want to watch tanks struggle.
   * Called fresh each time so presets never share mutable state.
   */
  build: () => { team1: TeamLoadout; team2: TeamLoadout };
};

/** Every vehicle a side can field, by category filter. */
function vehiclesWhere(faction: "allies" | "axis", pred: (v: VehicleDef) => boolean): string[] {
  return vehiclesForFaction(faction).filter(pred).map((v) => v.id);
}

function baseTeam(faction: "allies" | "axis"): TeamLoadout {
  return {
    label: faction === "allies" ? "Allies" : "Axis",
    faction,
    team: faction === "allies" ? "blue" : "red",
    enabledWeapons: [...ALL_WEAPON_IDS],
    enabledVehicles: vehiclesWhere(faction, () => true),
    botCount: 13,
    tickets: 320,
    skill: 0.55,
  };
}

/** Applies the same mutation to both sides, so presets stay symmetric. */
function bothTeams(mutate: (t: TeamLoadout) => void): { team1: TeamLoadout; team2: TeamLoadout } {
  const team1 = baseTeam("allies");
  const team2 = baseTeam("axis");
  mutate(team1);
  mutate(team2);
  return { team1, team2 };
}

export const PRESETS: Preset[] = [
  {
    id: "all_out",
    name: "All-Out Warfare",
    blurb: "Everything unlocked. Tanks, trucks, aircraft, the lot.",
    build: () => bothTeams(() => {}),
  },
  {
    id: "ww2_historical",
    name: "WW2 Historical",
    blurb: "Each side fields only what it historically operated. No shared kit.",
    build: () =>
      bothTeams((t) => {
        // Drop anything marked as shared — historical mode is strict.
        t.enabledVehicles = vehiclesWhere(t.faction, (v) => v.faction === t.faction);
      }),
  },
  {
    id: "infantry_only",
    name: "Infantry Only",
    blurb: "No vehicles at all. Rifles, SMGs and the ground between you.",
    build: () =>
      bothTeams((t) => {
        t.enabledVehicles = [];
        t.botCount = 18;
      }),
  },
  {
    id: "armor_clash",
    name: "Armor Clash",
    blurb: "Tanks and tank destroyers only. Bring AT weapons.",
    build: () =>
      bothTeams((t) => {
        t.enabledVehicles = vehiclesWhere(t.faction, (v) => v.category === "armor");
        t.botCount = 10;
      }),
  },
  {
    id: "air_superiority",
    name: "Air Superiority",
    blurb: "Aircraft and light ground transport. The fight is overhead.",
    build: () =>
      bothTeams((t) => {
        t.enabledVehicles = vehiclesWhere(t.faction, (v) => v.category === "air" || v.category === "light");
        t.botCount = 10;
      }),
  },
];

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`matchConfig: unknown preset "${id}"`);
  return p;
}

/* ================================================================== */
/*  State manager                                                       */
/* ================================================================== */

/**
 * One map's saved configuration. Every map keeps its own, the way Ravenfield
 * remembers what you set up on each battlefield: switch to the bocage, change
 * its roster, switch back to the valley, and the valley is how you left it.
 */
export type MapLoadout = {
  seed: number;
  /** Which preset this was last built from, or null once hand-edited. */
  presetId: PresetId | null;
  teams: { team1: TeamLoadout; team2: TeamLoadout };
};

/** Bumped whenever the saved shape changes, so old saves are discarded. */
const STORAGE_KEY = "claudefield.matchConfig.v1";

function cloneTeam(t: TeamLoadout): TeamLoadout {
  return { ...t, enabledWeapons: [...t.enabledWeapons], enabledVehicles: [...t.enabledVehicles] };
}

function defaultLoadout(map: MapDef): MapLoadout {
  return { seed: map.seed, presetId: map.defaultPreset, teams: presetById(map.defaultPreset).build() };
}

/**
 * Rebuilds one saved map entry, keeping only what the current catalog still
 * recognises. A save written before a weapon or vehicle was renamed must not
 * be able to put an unknown id into the spawner, so anything unrecognised is
 * dropped rather than trusted.
 */
function sanitizeLoadout(map: MapDef, raw: unknown): MapLoadout {
  const base = defaultLoadout(map);
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Partial<MapLoadout>;
  if (typeof r.seed === "number" && Number.isFinite(r.seed)) base.seed = Math.floor(r.seed);
  base.presetId = PRESETS.some((p) => p.id === r.presetId) ? (r.presetId as PresetId) : null;
  for (const slot of ["team1", "team2"] as const) {
    const saved = r.teams?.[slot];
    if (!saved) continue;
    const team = base.teams[slot];
    const allowedVehicles = new Set(vehiclesForFaction(team.faction).map((v) => v.id));
    if (Array.isArray(saved.enabledWeapons)) {
      team.enabledWeapons = saved.enabledWeapons.filter((w) => ALL_WEAPON_IDS.includes(w));
    }
    if (Array.isArray(saved.enabledVehicles)) {
      team.enabledVehicles = saved.enabledVehicles.filter((v) => allowedVehicles.has(v));
    }
    if (typeof saved.botCount === "number") team.botCount = clampInt(saved.botCount, 0, 40);
    if (typeof saved.tickets === "number") team.tickets = clampInt(saved.tickets, 50, 1000);
    if (typeof saved.skill === "number") team.skill = Math.max(0, Math.min(1, saved.skill));
  }
  return base;
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Holds the live setup-screen state and notifies subscribers on every change.
 * The UI binds to this; nothing else mutates it. `getMatchSettings()` returns
 * a deep copy, so the running match can never be altered by someone reopening
 * the menu mid-game.
 *
 * Loadouts are stored per map and persisted to localStorage, so the roster you
 * build for a battlefield is still there next time you pick it — including
 * after a page reload.
 */
export class MatchConfig {
  private mapId: string;
  private byMap = new Map<string, MapLoadout>();
  private listeners = new Set<(s: MatchSettings) => void>();

  constructor(startMapId: string = MAPS[0].id) {
    for (const m of MAPS) this.byMap.set(m.id, defaultLoadout(m));
    this.mapId = MAPS.some((m) => m.id === startMapId) ? startMapId : MAPS[0].id;
    this.load();
  }

  /* ---------------- persistence ---------------- */

  private load() {
    const raw = readStorage();
    if (!raw) return;
    if (typeof raw.mapId === "string" && MAPS.some((m) => m.id === raw.mapId)) this.mapId = raw.mapId;
    for (const m of MAPS) {
      const saved = (raw.byMap as Record<string, unknown> | undefined)?.[m.id];
      if (saved !== undefined) this.byMap.set(m.id, sanitizeLoadout(m, saved));
    }
  }

  private save() {
    writeStorage({ mapId: this.mapId, byMap: Object.fromEntries(this.byMap) });
  }

  /* ---------------- subscriptions ---------------- */

  subscribe(fn: (s: MatchSettings) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.save();
    const snapshot = this.getMatchSettings();
    for (const fn of this.listeners) fn(snapshot);
  }

  /* ---------------- reading ---------------- */

  /** The loadout being edited: whichever map is currently selected. */
  private current(): MapLoadout {
    const l = this.byMap.get(this.mapId);
    if (!l) throw new Error(`matchConfig: no loadout for map "${this.mapId}"`);
    return l;
  }

  /** Deep copy, so callers can hold it without aliasing live state. */
  getMatchSettings(): MatchSettings {
    const l = this.current();
    return {
      mapId: this.mapId,
      seed: l.seed,
      teams: { team1: cloneTeam(l.teams.team1), team2: cloneTeam(l.teams.team2) },
    };
  }

  /** Which preset the current map is showing, or null if it has been edited. */
  activePreset(): PresetId | null {
    return this.current().presetId;
  }

  /** A one-line summary of a map's saved roster, for the map picker. */
  summaryFor(mapId: string): { vehicles: number; weapons: number; bots: number } {
    const l = this.byMap.get(mapId) ?? defaultLoadout(mapById(mapId));
    const t = l.teams.team1;
    return { vehicles: t.enabledVehicles.length, weapons: t.enabledWeapons.length, bots: t.botCount };
  }

  /* ---------------- editing ---------------- */

  /** Switches which map is selected. The previous map keeps its own loadout. */
  setMap(mapId: string) {
    this.mapId = mapById(mapId).id;
    this.emit();
  }

  /** Applies a preset's rosters to the map currently being configured. */
  applyPreset(id: PresetId) {
    const l = this.current();
    l.teams = presetById(id).build();
    l.presetId = id;
    this.emit();
  }

  /** Puts this map back to the roster it shipped with. */
  resetMap() {
    this.byMap.set(this.mapId, defaultLoadout(mapById(this.mapId)));
    this.emit();
  }

  /** Copies this map's roster onto every other map, seeds left alone. */
  copyToAllMaps() {
    const source = this.current();
    for (const m of MAPS) {
      if (m.id === this.mapId) continue;
      const target = this.byMap.get(m.id);
      if (!target) continue;
      target.presetId = source.presetId;
      target.teams = { team1: cloneTeam(source.teams.team1), team2: cloneTeam(source.teams.team2) };
    }
    this.emit();
  }

  /** Re-rolls terrain without changing which map is selected. */
  randomizeSeed() {
    this.current().seed = Math.floor(Math.random() * 1e9);
    this.emit();
  }

  private teamOf(slot: "team1" | "team2") {
    return this.current().teams[slot];
  }

  /** Any hand edit means the roster no longer matches the preset it came from. */
  private markCustom() {
    this.current().presetId = null;
  }

  toggleWeapon(slot: "team1" | "team2", weaponId: string) {
    const t = this.teamOf(slot);
    const i = t.enabledWeapons.indexOf(weaponId);
    if (i >= 0) t.enabledWeapons.splice(i, 1);
    else t.enabledWeapons.push(weaponId);
    this.markCustom();
    this.emit();
  }

  toggleVehicle(slot: "team1" | "team2", vehicleId: string) {
    const t = this.teamOf(slot);
    const i = t.enabledVehicles.indexOf(vehicleId);
    if (i >= 0) t.enabledVehicles.splice(i, 1);
    else t.enabledVehicles.push(vehicleId);
    this.markCustom();
    this.emit();
  }

  /** Select-All / Deselect-All for one weapon group. */
  setWeaponGroup(slot: "team1" | "team2", group: WeaponGroup, enabled: boolean) {
    const t = this.teamOf(slot);
    const ids = WEAPON_GROUPS[group];
    t.enabledWeapons = enabled
      ? Array.from(new Set([...t.enabledWeapons, ...ids]))
      : t.enabledWeapons.filter((w) => !ids.includes(w));
    this.markCustom();
    this.emit();
  }

  /** Select-All / Deselect-All for one vehicle category. */
  setVehicleCategory(slot: "team1" | "team2", category: VehicleCategory, enabled: boolean) {
    const t = this.teamOf(slot);
    const ids = vehiclesInCategory(t.faction, category).map((v) => v.id);
    t.enabledVehicles = enabled
      ? Array.from(new Set([...t.enabledVehicles, ...ids]))
      : t.enabledVehicles.filter((v) => !ids.includes(v));
    this.markCustom();
    this.emit();
  }

  setBotCount(slot: "team1" | "team2", n: number) {
    this.teamOf(slot).botCount = clampInt(n, 0, 40);
    this.markCustom();
    this.emit();
  }

  setTickets(slot: "team1" | "team2", n: number) {
    this.teamOf(slot).tickets = clampInt(n, 50, 1000);
    this.markCustom();
    this.emit();
  }

  setSkill(slot: "team1" | "team2", v: number) {
    this.teamOf(slot).skill = Math.max(0, Math.min(1, v));
    this.markCustom();
    this.emit();
  }

  /**
   * Guards against a configuration the match cannot actually run — an empty
   * weapon list would spawn soldiers with nothing to hold. Returns a list of
   * human-readable problems; empty means good to start.
   */
  validate(): string[] {
    const problems: string[] = [];
    for (const slot of ["team1", "team2"] as const) {
      const t = this.teamOf(slot);
      if (t.enabledWeapons.length === 0) {
        problems.push(`${t.label} has no weapons enabled.`);
      }
      const hasPrimary = t.enabledWeapons.some((w) => !WEAPON_GROUPS.sidearms.includes(w));
      if (t.enabledWeapons.length > 0 && !hasPrimary) {
        problems.push(`${t.label} has only sidearms — enable at least one primary weapon.`);
      }
    }
    return problems;
  }
}

/* ---------------- storage helpers ---------------- */

/**
 * localStorage is absent in some embeddings and throws outright in private
 * browsing, so both directions are best-effort: a failure to persist costs the
 * player their saved rosters, it must never stop the menu from opening.
 */
function readStorage(): { mapId?: string; byMap?: unknown } | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as { mapId?: string; byMap?: unknown }) : null;
  } catch {
    return null;
  }
}

function writeStorage(value: { mapId: string; byMap: Record<string, MapLoadout> }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* full, disabled or unavailable — the menu still works, it just forgets. */
  }
}
