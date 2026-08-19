import type { Team } from "./units";
import {
  AVAILABLE_ERAS as PLAYABLE_ERAS,
  ERA_LABEL,
  NATIONS_OF_ERA,
  NATION_LABEL,
  NATION_SHORT,
  SIDE_OF,
  arsenalFor,
  defaultNations,
  eraOfNation,
  type EraId,
  type Nation,
  type Side,
} from "./eras";

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
  | "heavy_armored_car" // 8x8, real turret and gun — SdKfz 234/2 Puma
  | "heavy_halftrack" // long artillery tractor, open bed — SdKfz 7
  | "sloped_medium" // medium tank built round sloped plate — T-34/76
  | "medium_tank" // turret, balanced — Sherman, Panzer IV
  | "heavy_tank" // turret, thick armour, slow — Tiger I
  | "tank_destroyer" // casemate hull, no turret, limited traverse — StuG III
  | "fighter" // single-engine monoplane fighter — Mustang, Spitfire, Bf 109
  | "dive_bomber" // inverted gull wing, fixed spatted gear — Ju 87 Stuka
  | "attack_plane" // armoured ground-attack — IL-2 Shturmovik
  | "medium_bomber" // twin engines, twin tail — B-25 Mitchell
  | "heavy_bomber" // four engines — B-17, Lancaster
  | "floatplane" // fighter on floats — A6M2-N Rufe
  /* ---- Great War ---- */
  | "rhomboid_tank" // all-round track frame, guns in side sponsons — Mark IV
  | "box_tank" // tall armoured box on a short track base — A7V
  | "vintage_armored_car" // spoked wheels, tall riveted body, small turret
  | "field_gun" // towed gun, emplaced: it aims but does not drive
  | "howitzer" // heavier towed piece, lobbed fire, punishing reload
  | "wagon" // horse-drawn supply cart, unarmed
  | "biplane" // two-wing scout — Camel, Dr.I, SPAD
  /* ---- Imperial Japanese Army ---- */
  | "light_tank" // small turret, bell-crank suspension — Type 95 Ha-Go
  | "riveted_medium" // riveted hull, tall narrow turret — Chi-Ha, Chi-He, Chi-Nu
  | "tankette" // two-man tracked scout, MG only — Type 92, Type 95 So-Ki
  | "boxy_armored_car" // tall slab-sided 6x6 with a small turret — Type 93 Sumida
  | "trailer" // towed two-wheel ammunition cart
  /* ---- Red Army ---- */
  | "soviet_heavy" // torsion-bar heavy — KV-1, KV-2, IS-2
  | "soviet_assault_gun" // heavy casemate on a heavy hull — ISU-152
  | "soviet_td" // casemate on a T-34 hull — SU-85, SU-100
  | "fast_tank" // big Christie road wheels, thin plate — BT-7
  | "soviet_light" // small tracked light tank or tractor — T-60, T-70, T-20
  | "soviet_armored_car" // riveted 4x4 or 6x6 with a small turret — BA-64, BA-10
  | "rocket_truck"; // truck carrying a rail rack — Katyusha BM-13

/** Broad grouping used by the setup UI's category rows and Select-All buttons. */
export type VehicleCategory = "light" | "transport" | "armor" | "artillery" | "air";

export const CATEGORY_LABEL: Record<VehicleCategory, string> = {
  light: "Light Vehicles",
  transport: "Transports",
  armor: "Armor",
  artillery: "Artillery & Support",
  air: "Aircraft",
};

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
  /**
   * Which era this vehicle belongs to. A match runs one era at a time, so a
   * Mark IV never has to share a map with a Tiger unless someone deliberately
   * asks for it.
   */
  era: EraId;
  /** Short label for the HUD and kill feed. */
  name: string;
  /** Full historical designation, shown in the setup screen. */
  displayName: string;
  chassis: Chassis;
  category: VehicleCategory;
  /**
   * Every nation that fielded this vehicle. Lend-lease means one entry can
   * belong to several — the Sherman served with the USA, the UK and the USSR —
   * so a team's roster is everything listing its own nation.
   */
  nations: Nation[];
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

/**
 * Great War plate. Riveted boiler steel stops rifle fire and not much else —
 * a Mark IV's 12 mm is proof against the machine guns it was built to cross,
 * and paper against anything with a gun.
 */
const RIVETED_ARMOR: ArmorScheme = {
  hullFront: 12, hullSide: 8, hullRear: 8, hullTop: 6,
  turretFront: 12, turretSide: 8, turretRear: 8, turretTop: 6,
};

/** The A7V carried the thickest plate of the war on its nose. */
const A7V_ARMOR: ArmorScheme = {
  hullFront: 30, hullSide: 15, hullRear: 20, hullTop: 6,
  turretFront: 30, turretSide: 15, turretRear: 20, turretTop: 6,
};

const RIVETED_LIGHT: ArmorScheme = {
  hullFront: 8, hullSide: 6, hullRear: 6, hullTop: 4,
  turretFront: 9, turretSide: 7, turretRear: 7, turretTop: 4,
};

/** A gun shield covers the crew from the front and nothing from anywhere else. */
const GUN_SHIELD: ArmorScheme = {
  hullFront: 6, hullSide: 1, hullRear: 1, hullTop: 1,
  turretFront: 6, turretSide: 1, turretRear: 1, turretTop: 1,
};

/**
 * The T-34's plate is thinner than a Sherman's but set at 60 degrees, and the
 * combat model already divides thickness by the cosine of the strike angle —
 * so the numbers here are the real ones and the geometry does the rest.
 */
const SLOPED_MEDIUM_ARMOR: ArmorScheme = {
  hullFront: 45, hullSide: 45, hullRear: 40, hullTop: 20,
  turretFront: 60, turretSide: 52, turretRear: 45, turretTop: 20,
};

/** Puma: proof against autocannon from the front, rifle-proof elsewhere. */
const PUMA_ARMOR: ArmorScheme = {
  hullFront: 30, hullSide: 8, hullRear: 10, hullTop: 6,
  turretFront: 30, turretSide: 14, turretRear: 14, turretTop: 6,
};

/**
 * Red Army plate. Soviet design put weight into the front and sloped it hard;
 * the sides are conventional, which is where they were killed.
 */
const T34_85_ARMOR: ArmorScheme = {
  hullFront: 45, hullSide: 45, hullRear: 40, hullTop: 20,
  turretFront: 90, turretSide: 75, turretRear: 52, turretTop: 20,
};

const KV_ARMOR: ArmorScheme = {
  hullFront: 75, hullSide: 75, hullRear: 70, hullTop: 30,
  turretFront: 90, turretSide: 75, turretRear: 75, turretTop: 30,
};

const IS2_ARMOR: ArmorScheme = {
  hullFront: 120, hullSide: 90, hullRear: 60, hullTop: 30,
  turretFront: 100, turretSide: 90, turretRear: 90, turretTop: 30,
};

const ISU_ARMOR: ArmorScheme = {
  hullFront: 90, hullSide: 75, hullRear: 60, hullTop: 30,
  turretFront: 90, turretSide: 75, turretRear: 60, turretTop: 30,
};

const SU_ARMOR: ArmorScheme = {
  hullFront: 45, hullSide: 45, hullRear: 40, hullTop: 20,
  turretFront: 45, turretSide: 45, turretRear: 40, turretTop: 20,
};

/** BT-7, T-60, T-70, BA-64: proof against small arms and nothing heavier. */
const BT_ARMOR: ArmorScheme = {
  hullFront: 22, hullSide: 13, hullRear: 13, hullTop: 10,
  turretFront: 22, turretSide: 15, turretRear: 15, turretTop: 10,
};

/**
 * Imperial Japanese Army plate. Thin by 1944 standards across the board — the
 * IJA built for the Pacific and China, where the opposition rarely had tanks.
 */
const JAPANESE_LIGHT: ArmorScheme = {
  hullFront: 12, hullSide: 12, hullRear: 12, hullTop: 9,
  turretFront: 12, turretSide: 12, turretRear: 12, turretTop: 9,
};

const JAPANESE_MEDIUM: ArmorScheme = {
  hullFront: 27, hullSide: 25, hullRear: 20, hullTop: 12,
  turretFront: 26, turretSide: 25, turretRear: 25, turretTop: 12,
};

const JAPANESE_MEDIUM_LATE: ArmorScheme = {
  hullFront: 50, hullSide: 25, hullRear: 20, hullTop: 12,
  turretFront: 50, turretSide: 25, turretRear: 25, turretTop: 12,
};

/** Tankettes and armoured cars: rifle-proof, and only just. */
const TANKETTE_ARMOR: ArmorScheme = {
  hullFront: 8, hullSide: 6, hullRear: 6, hullTop: 5,
  turretFront: 8, turretSide: 6, turretRear: 6, turretTop: 5,
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
    era: "ww2",
    name: "Jeep",
    displayName: "Willys MB Jeep",
    chassis: "light_car",
    category: "light",
    nations: ["usa", "uk", "ussr"],
    hp: 45,
    armor: UNARMORED,
    mobility: { maxSpeed: 24, reverseSpeed: 8, accel: 14, turnRate: 1.9, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 3,
    tint: 0x5a6338, // olive drab
    triangles: 450,
    blurb: "Fast open scout car. No protection whatsoever — speed is the armour.",
  },
  {
    id: "kubelwagen",
    era: "ww2",
    name: "Kübel",
    displayName: "Kübelwagen",
    chassis: "light_car",
    category: "light",
    nations: ["germany"],
    hp: 45,
    armor: UNARMORED,
    mobility: { maxSpeed: 23, reverseSpeed: 8, accel: 13.5, turnRate: 1.95, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 3,
    tint: 0x7a6f4a, // khaki
    triangles: 400,
    blurb: "The Axis scout car. Slightly nimbler than the Jeep, just as fragile.",
  },
  {
    id: "motorcycle_sidecar",
    era: "ww2",
    name: "Motorcycle",
    displayName: "BMW R75 Motorcycle",
    chassis: "motorcycle",
    category: "light",
    nations: ["germany"],
    hp: 28,
    armor: UNARMORED,
    mobility: { maxSpeed: 30, reverseSpeed: 5, accel: 18, turnRate: 2.4, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 1,
    tint: 0x6d6444,
    triangles: 350,
    blurb: "The fastest thing on the map, and the easiest to kill. One passenger in the sidecar.",
  },

  /* ---------- Transports ---------- */
  {
    id: "gmc_cckw",
    era: "ww2",
    name: "GMC Truck",
    displayName: "GMC CCKW 353 Truck",
    chassis: "truck",
    category: "transport",
    nations: ["usa", "uk", "ussr"],
    hp: 80,
    armor: UNARMORED,
    mobility: { maxSpeed: 17, reverseSpeed: 6, accel: 7, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x5a6338,
    triangles: 850,
    blurb: "Six-wheel hauler. Moves a whole squad, but a soft target the entire way.",
  },
  {
    id: "opel_blitz",
    era: "ww2",
    name: "Opel Blitz",
    displayName: "Opel Blitz Truck",
    chassis: "truck",
    category: "transport",
    nations: ["germany"],
    hp: 80,
    armor: UNARMORED,
    mobility: { maxSpeed: 18, reverseSpeed: 6, accel: 7.2, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x7a6f4a,
    triangles: 800,
    blurb: "Canvas-topped Axis squad truck. Fractionally quicker than the GMC.",
  },
  {
    id: "dukw",
    era: "ww2",
    name: "DUKW",
    displayName: "GMC DUKW Amphibious Truck",
    chassis: "amphibious",
    category: "transport",
    nations: ["usa", "uk"],
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
    era: "ww2",
    name: "Half-track",
    displayName: "SdKfz 251 Half-track",
    chassis: "halftrack",
    category: "transport",
    nations: ["germany"],
    hp: 120,
    armor: LIGHT_ARMOR,
    mobility: { maxSpeed: 16, reverseSpeed: 6, accel: 7, turnRate: 1.05, turretTraverse: 0, turretArc: 0 },
    weapons: ["coax"],
    passengerSeats: 6,
    tint: 0x4a4d4a, // dark gray
    triangles: 900,
    blurb: "Armoured squad carrier with a pintle MG. Shrugs off rifle fire, not cannon.",
  },

  /* ---------- Armor ---------- */
  {
    id: "m8_greyhound",
    era: "ww2",
    name: "Greyhound",
    displayName: "M8 Greyhound Armored Car",
    chassis: "armored_car",
    category: "armor",
    nations: ["usa", "uk"],
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
    era: "ww2",
    name: "Sherman",
    displayName: "M4 Sherman Tank",
    chassis: "medium_tank",
    category: "armor",
    nations: ["usa", "uk", "ussr"],
    hp: 200,
    armor: MEDIUM_ARMOR,
    mobility: { maxSpeed: 12.5, reverseSpeed: 5.5, accel: 5.2, turnRate: 0.72, turretTraverse: 0.55, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 42, he: 24 },
    passengerSeats: 0,
    tint: 0x5a6338,
    triangles: 1200,
    blurb: "The Allied workhorse. Sloped glacis, fast turret, dies to a Tiger at range.",
  },
  {
    id: "panzer_iv",
    era: "ww2",
    name: "Panzer IV",
    displayName: "Panzer IV Ausf. H",
    chassis: "medium_tank",
    category: "armor",
    nations: ["germany"],
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
    triangles: 1150,
    blurb: "Thick flat plate and a good gun. Angle the hull or the slope advantage is lost.",
  },
  {
    id: "tiger_i",
    era: "ww2",
    name: "Tiger",
    displayName: "Tiger I",
    chassis: "heavy_tank",
    category: "armor",
    nations: ["germany"],
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
    era: "ww2",
    name: "StuG III",
    displayName: "StuG III Ausf. G",
    chassis: "tank_destroyer",
    category: "armor",
    nations: ["germany"],
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

  /* ---------- Red Army ---------- */
  {
    id: "t34_85",
    era: "ww2",
    name: "T-34/85",
    displayName: "T-34/85",
    chassis: "sloped_medium",
    category: "armor",
    nations: ["ussr"],
    hp: 170,
    armor: T34_85_ARMOR,
    mobility: { maxSpeed: 14, reverseSpeed: 5, accel: 6.0, turnRate: 0.78, turretTraverse: 0.46, turretArc: Math.PI },
    weapons: ["zis_85", "coax"],
    ammo: { ap: 32, he: 24 },
    passengerSeats: 4,
    tint: 0x4c5742,
    triangles: 1200,
    blurb: "The 1944 answer: a three-man turret and an 85 mm on the hull that already worked.",
  },
  {
    id: "kv1",
    era: "ww2",
    name: "KV-1",
    displayName: "KV-1",
    chassis: "soviet_heavy",
    category: "armor",
    nations: ["ussr"],
    hp: 210,
    armor: KV_ARMOR,
    mobility: { maxSpeed: 8.5, reverseSpeed: 3.6, accel: 3.4, turnRate: 0.48, turretTraverse: 0.34, turretArc: Math.PI },
    weapons: ["f34_76", "coax"],
    ammo: { ap: 34, he: 32 },
    passengerSeats: 3,
    tint: 0x4a5340,
    triangles: 1250,
    blurb: "Armour German guns bounced off in 1941, on a gearbox nobody could change gear in.",
  },
  {
    id: "kv2",
    era: "ww2",
    name: "KV-2",
    displayName: "KV-2",
    chassis: "soviet_heavy",
    category: "armor",
    nations: ["ussr"],
    hp: 225,
    armor: KV_ARMOR,
    // The turret weighs as much as a light tank. It traverses accordingly.
    mobility: { maxSpeed: 7.5, reverseSpeed: 3.2, accel: 2.8, turnRate: 0.42, turretTraverse: 0.18, turretArc: Math.PI },
    weapons: ["ml20_152", "coax"],
    ammo: { ap: 8, he: 28 },
    passengerSeats: 3,
    tint: 0x4a5340,
    triangles: 1300,
    blurb: "A 152 mm howitzer in a turret the size of a shed. Sixteen seconds a shot, and worth it.",
  },
  {
    id: "is2",
    era: "ww2",
    name: "IS-2",
    displayName: "IS-2 Stalin",
    chassis: "soviet_heavy",
    category: "armor",
    nations: ["ussr"],
    hp: 240,
    armor: IS2_ARMOR,
    mobility: { maxSpeed: 10.5, reverseSpeed: 4.2, accel: 3.8, turnRate: 0.55, turretTraverse: 0.3, turretArc: Math.PI },
    weapons: ["d25t_122", "coax"],
    ammo: { ap: 14, he: 14 },
    passengerSeats: 3,
    tint: 0x4f5a44,
    triangles: 1350,
    blurb: "Sloped cast front and a 122 mm. Twenty-eight rounds total — every one has to count.",
  },
  {
    id: "isu152",
    era: "ww2",
    name: "ISU-152",
    displayName: "ISU-152 Assault Gun",
    chassis: "soviet_assault_gun",
    category: "armor",
    nations: ["ussr"],
    hp: 215,
    armor: ISU_ARMOR,
    mobility: { maxSpeed: 10, reverseSpeed: 4, accel: 3.6, turnRate: 0.5, turretTraverse: 0.16, turretArc: 0.2 },
    weapons: ["ml20_152", "coax"],
    ammo: { ap: 8, he: 24 },
    passengerSeats: 2,
    tint: 0x4a5340,
    triangles: 1250,
    blurb: "Zveroboy — beast killer. No turret at all: point the whole vehicle, then remove a building.",
  },
  {
    id: "su85",
    era: "ww2",
    name: "SU-85",
    displayName: "SU-85 Tank Destroyer",
    chassis: "soviet_td",
    category: "armor",
    nations: ["ussr"],
    hp: 150,
    armor: SU_ARMOR,
    mobility: { maxSpeed: 13.5, reverseSpeed: 5, accel: 5.8, turnRate: 0.76, turretTraverse: 0.3, turretArc: 0.18 },
    weapons: ["zis_85", "coax"],
    ammo: { ap: 34, he: 14 },
    passengerSeats: 1,
    tint: 0x4c5742,
    triangles: 1050,
    blurb: "A T-34 hull with the turret replaced by a fixed 85. Low, cheap and it hits hard.",
  },
  {
    id: "su100",
    era: "ww2",
    name: "SU-100",
    displayName: "SU-100 Tank Destroyer",
    chassis: "soviet_td",
    category: "armor",
    nations: ["ussr"],
    hp: 160,
    armor: SU_ARMOR,
    mobility: { maxSpeed: 13, reverseSpeed: 5, accel: 5.5, turnRate: 0.74, turretTraverse: 0.26, turretArc: 0.16 },
    weapons: ["d10_100", "coax"],
    ammo: { ap: 28, he: 10 },
    passengerSeats: 1,
    tint: 0x4c5742,
    triangles: 1100,
    blurb: "The same idea with a 100 mm. Nothing German on this list survives a frontal hit.",
  },
  {
    id: "bt7",
    era: "ww2",
    name: "BT-7",
    displayName: "BT-7 Fast Tank",
    chassis: "fast_tank",
    category: "armor",
    nations: ["ussr"],
    hp: 90,
    armor: BT_ARMOR,
    // The fastest tracked thing in the game, and made of tissue paper.
    mobility: { maxSpeed: 19, reverseSpeed: 7, accel: 8.5, turnRate: 1.1, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["zis_45", "coax"],
    ammo: { ap: 40, he: 20 },
    passengerSeats: 1,
    tint: 0x53603f,
    triangles: 880,
    blurb: "Christie suspension and a 45 mm. Outruns everything, stops nothing.",
  },
  {
    id: "t60",
    era: "ww2",
    name: "T-60",
    displayName: "T-60 Light Tank",
    chassis: "soviet_light",
    category: "armor",
    nations: ["ussr"],
    hp: 65,
    armor: BT_ARMOR,
    mobility: { maxSpeed: 15, reverseSpeed: 6, accel: 8, turnRate: 1.35, turretTraverse: 0.6, turretArc: Math.PI },
    weapons: ["tnsh_20", "coax"],
    passengerSeats: 0,
    tint: 0x53603f,
    triangles: 620,
    blurb: "A 20 mm autocannon on a tractor chassis. Built because tanks were needed and there were none.",
  },
  {
    id: "t70",
    era: "ww2",
    name: "T-70",
    displayName: "T-70 Light Tank",
    chassis: "soviet_light",
    category: "armor",
    nations: ["ussr"],
    hp: 82,
    armor: BT_ARMOR,
    mobility: { maxSpeed: 14.5, reverseSpeed: 6, accel: 7.5, turnRate: 1.25, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["zis_45", "coax"],
    ammo: { ap: 34, he: 16 },
    passengerSeats: 0,
    tint: 0x53603f,
    triangles: 700,
    blurb: "The T-60 with a 45 mm and thicker plate. One man to command, aim, load and fire.",
  },
  {
    id: "t20_komsomolets",
    era: "ww2",
    name: "T-20",
    displayName: "T-20 Komsomolets Tractor",
    chassis: "soviet_light",
    category: "transport",
    nations: ["ussr"],
    hp: 55,
    armor: BT_ARMOR,
    mobility: { maxSpeed: 13, reverseSpeed: 5, accel: 7, turnRate: 1.3, turretTraverse: 0.7, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 6,
    tint: 0x4f5a3d,
    triangles: 600,
    blurb: "Armoured artillery tractor with bench seats on the back. Tows the guns and carries their crew.",
  },
  {
    id: "ba64",
    era: "ww2",
    name: "BA-64",
    displayName: "BA-64 Light Armored Car",
    chassis: "soviet_armored_car",
    category: "armor",
    nations: ["ussr"],
    hp: 50,
    armor: BT_ARMOR,
    mobility: { maxSpeed: 22, reverseSpeed: 9, accel: 11, turnRate: 1.7, turretTraverse: 0.7, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 1,
    tint: 0x53603f,
    triangles: 480,
    blurb: "A jeep in faceted armour with an open-topped MG turret. Scouting, and nothing braver.",
  },
  {
    id: "ba10",
    era: "ww2",
    name: "BA-10",
    displayName: "BA-10 Armored Car",
    chassis: "soviet_armored_car",
    category: "armor",
    nations: ["ussr"],
    hp: 78,
    armor: TANKETTE_ARMOR,
    mobility: { maxSpeed: 18, reverseSpeed: 8, accel: 8, turnRate: 1.2, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["zis_45", "coax"],
    ammo: { ap: 26, he: 14 },
    passengerSeats: 2,
    tint: 0x4f5a3d,
    triangles: 720,
    blurb: "Six wheels and a real 45 mm turret. An armoured car that can genuinely fight a light tank.",
  },
  {
    id: "gaz_aaa",
    era: "ww2",
    name: "GAZ-AAA",
    displayName: "GAZ-AAA Utility Truck",
    chassis: "truck",
    category: "transport",
    nations: ["ussr"],
    hp: 74,
    armor: UNARMORED,
    mobility: { maxSpeed: 16, reverseSpeed: 6, accel: 6.6, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x4f5a3d,
    triangles: 780,
    blurb: "The Red Army's 6x6 workhorse. Everything that is not tracked rides on one of these.",
  },
  {
    id: "katyusha_bm13",
    era: "ww2",
    name: "Katyusha",
    displayName: "Katyusha BM-13",
    chassis: "rocket_truck",
    category: "artillery",
    nations: ["ussr"],
    hp: 70,
    armor: UNARMORED,
    mobility: { maxSpeed: 14, reverseSpeed: 5, accel: 5.5, turnRate: 0.95, turretTraverse: 0.35, turretArc: 0.5 },
    weapons: ["katyusha_rocket"],
    // Sixteen on the rails and nothing in reserve — fire them and drive away.
    ammo: { ap: 0, he: 16 },
    passengerSeats: 2,
    tint: 0x4f5a3d,
    triangles: 900,
    blurb: "Sixteen rockets on a truck. Empties the rack in seconds, then it is an unarmed lorry.",
  },

  /* ---------- Imperial Japanese Army ---------- */
  {
    id: "type95_hago",
    era: "ww2",
    name: "Ha-Go",
    displayName: "Type 95 Ha-Go",
    chassis: "light_tank",
    category: "armor",
    nations: ["japan"],
    hp: 85,
    armor: JAPANESE_LIGHT,
    mobility: { maxSpeed: 12.5, reverseSpeed: 5, accel: 6.5, turnRate: 0.95, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["type94_37", "coax"],
    ammo: { ap: 30, he: 22 },
    passengerSeats: 1,
    tint: 0x7b7550,
    triangles: 700,
    blurb: "Fast, thin-skinned light tank. Fine against infantry, hopeless against armour.",
  },
  {
    id: "type97_chiha",
    era: "ww2",
    name: "Chi-Ha",
    displayName: "Type 97 Chi-Ha",
    chassis: "riveted_medium",
    category: "armor",
    nations: ["japan"],
    hp: 115,
    armor: JAPANESE_MEDIUM,
    mobility: { maxSpeed: 11.5, reverseSpeed: 5, accel: 5.6, turnRate: 0.78, turretTraverse: 0.45, turretArc: Math.PI },
    weapons: ["type97_57", "coax"],
    ammo: { ap: 26, he: 30 },
    passengerSeats: 2,
    tint: 0x7d7752,
    triangles: 950,
    blurb: "The IJA's standard medium. A short 57 mm meant for bunkers, not tanks.",
  },
  {
    id: "type1_chihe",
    era: "ww2",
    name: "Chi-He",
    displayName: "Type 1 Chi-He",
    chassis: "riveted_medium",
    category: "armor",
    nations: ["japan"],
    hp: 130,
    armor: JAPANESE_MEDIUM_LATE,
    mobility: { maxSpeed: 12.8, reverseSpeed: 5.5, accel: 5.9, turnRate: 0.8, turretTraverse: 0.48, turretArc: Math.PI },
    weapons: ["type1_47", "coax"],
    ammo: { ap: 30, he: 26 },
    passengerSeats: 2,
    tint: 0x6f7a52,
    triangles: 980,
    blurb: "Welded rather than riveted, with a 47 mm that can actually hurt a Stuart.",
  },
  {
    id: "type3_chinu",
    era: "ww2",
    name: "Chi-Nu",
    displayName: "Type 3 Chi-Nu",
    chassis: "riveted_medium",
    category: "armor",
    nations: ["japan"],
    hp: 140,
    armor: JAPANESE_MEDIUM_LATE,
    mobility: { maxSpeed: 11.8, reverseSpeed: 5, accel: 5.4, turnRate: 0.74, turretTraverse: 0.42, turretArc: Math.PI },
    weapons: ["type3_75", "coax"],
    ammo: { ap: 26, he: 28 },
    passengerSeats: 2,
    tint: 0x5f6b46,
    triangles: 1000,
    blurb: "A 75 mm in a big new turret on an old hull. The best tank Japan fielded, and far too late.",
  },
  {
    id: "type92_jyusokosha",
    era: "ww2",
    name: "Type 92",
    displayName: "Type 92 Jyu-Sokosha",
    chassis: "tankette",
    category: "armor",
    nations: ["japan"],
    hp: 45,
    armor: TANKETTE_ARMOR,
    mobility: { maxSpeed: 16, reverseSpeed: 6, accel: 8.5, turnRate: 1.5, turretTraverse: 0.7, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 0,
    tint: 0x77714d,
    triangles: 500,
    blurb: "A two-man tracked scout the size of a car. Machine gun only — do not pick a fight.",
  },
  {
    id: "type93_sumida",
    era: "ww2",
    name: "Sumida",
    displayName: "Type 93 Sumida",
    chassis: "boxy_armored_car",
    category: "armor",
    nations: ["japan"],
    hp: 70,
    armor: TANKETTE_ARMOR,
    mobility: { maxSpeed: 19, reverseSpeed: 8, accel: 8.5, turnRate: 1.25, turretTraverse: 0.6, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 4,
    tint: 0x8a8158,
    triangles: 620,
    blurb: "Tall slab-sided armoured car built to run on roads or rails. Roomy, and a large target.",
  },
  {
    id: "type95_soki",
    era: "ww2",
    name: "So-Ki",
    displayName: "Type 95 So-Ki",
    chassis: "tankette",
    category: "armor",
    nations: ["japan"],
    hp: 60,
    armor: TANKETTE_ARMOR,
    mobility: { maxSpeed: 15, reverseSpeed: 6, accel: 7.5, turnRate: 1.3, turretTraverse: 0.65, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 2,
    tint: 0x5c6b45,
    triangles: 560,
    blurb: "Armoured rail tractor turned recon vehicle. Longer than the Type 92 and just as thin.",
  },
  {
    id: "type94_truck",
    era: "ww2",
    name: "Type 94",
    displayName: "Type 94 6-Wheeled Truck",
    chassis: "truck",
    category: "transport",
    nations: ["japan"],
    hp: 78,
    armor: UNARMORED,
    mobility: { maxSpeed: 16.5, reverseSpeed: 6, accel: 6.8, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 8,
    tint: 0x847a55,
    triangles: 820,
    blurb: "The army's workhorse 6x6. Open bed, no cover, carries a section and their kit.",
  },
  {
    id: "isuzu_tu10",
    era: "ww2",
    name: "Isuzu",
    displayName: "Isuzu TU-10 Truck",
    chassis: "truck",
    category: "transport",
    nations: ["japan"],
    hp: 80,
    armor: UNARMORED,
    mobility: { maxSpeed: 17.5, reverseSpeed: 6, accel: 7.2, turnRate: 1.02, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 9,
    tint: 0x5f6b46,
    triangles: 800,
    blurb: "Canvas-tilted cargo truck. Keeps the rain off a squad and nothing else.",
  },
  {
    id: "kurogane_type95",
    era: "ww2",
    name: "Kurogane",
    displayName: "Kurogane Type 95",
    chassis: "light_car",
    category: "light",
    nations: ["japan"],
    hp: 42,
    armor: UNARMORED,
    mobility: { maxSpeed: 22, reverseSpeed: 8, accel: 13, turnRate: 1.9, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 2,
    tint: 0x8a8158,
    triangles: 420,
    blurb: "Japan's scout car — the first purpose-built 4x4 of its kind. Light, quick, unprotected.",
  },
  {
    id: "type1_toku",
    era: "ww2",
    name: "To-Ku",
    displayName: "Type 1 To-Ku Transport",
    chassis: "halftrack",
    category: "transport",
    nations: ["japan"],
    hp: 92,
    armor: LIGHT_ARMOR,
    mobility: { maxSpeed: 15.5, reverseSpeed: 5.5, accel: 6.6, turnRate: 1.0, turretTraverse: 0.6, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 9,
    tint: 0x6b7349,
    triangles: 880,
    blurb: "Half-tracked troop carrier. Thin armour, but it goes where the trucks bog down.",
  },
  {
    id: "type94_37mm",
    era: "ww2",
    name: "Type 94 37",
    displayName: "Type 94 37mm Gun",
    chassis: "field_gun",
    category: "artillery",
    nations: ["japan"],
    hp: 40,
    armor: GUN_SHIELD,
    mobility: { maxSpeed: 0, reverseSpeed: 0, accel: 0, turnRate: 0, turretTraverse: 0.55, turretArc: 0.7 },
    weapons: ["type94_37"],
    ammo: { ap: 40, he: 20 },
    passengerSeats: 0,
    tint: 0x7d7752,
    triangles: 280,
    blurb: "Light anti-tank gun on a split trail. Small enough to manhandle, big enough to kill a light tank.",
  },
  {
    id: "type90_75mm",
    era: "ww2",
    name: "Type 90 75",
    displayName: "Type 90 75mm Field Gun",
    chassis: "field_gun",
    category: "artillery",
    nations: ["japan"],
    hp: 55,
    armor: GUN_SHIELD,
    mobility: { maxSpeed: 0, reverseSpeed: 0, accel: 0, turnRate: 0, turretTraverse: 0.42, turretArc: 0.55 },
    weapons: ["type3_75"],
    ammo: { ap: 14, he: 38 },
    passengerSeats: 0,
    tint: 0x6f7a52,
    triangles: 320,
    blurb: "The IJA's divisional 75. Long-barrelled, accurate, and the best gun on this list.",
  },
  {
    id: "type95_150mm",
    era: "ww2",
    name: "Type 95 150",
    displayName: "Type 95 150mm Howitzer",
    chassis: "howitzer",
    category: "artillery",
    nations: ["japan"],
    hp: 68,
    armor: GUN_SHIELD,
    mobility: { maxSpeed: 0, reverseSpeed: 0, accel: 0, turnRate: 0, turretTraverse: 0.26, turretArc: 0.38 },
    weapons: ["howitzer_155"],
    ammo: { ap: 6, he: 30 },
    passengerSeats: 0,
    tint: 0x5c6b45,
    triangles: 380,
    blurb: "Heavy howitzer on a big-wheeled carriage. Slow to load, and it flattens whatever it lands on.",
  },
  {
    id: "type94_trailer",
    era: "ww2",
    name: "Ammo Cart",
    displayName: "Type 94 Ammo Trailer",
    chassis: "trailer",
    category: "artillery",
    nations: ["japan"],
    hp: 30,
    armor: UNARMORED,
    mobility: { maxSpeed: 6, reverseSpeed: 3, accel: 4, turnRate: 1.3, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 2,
    tint: 0x7d7752,
    triangles: 240,
    blurb: "Two wheels, a drawbar and a stack of crates. Unarmed, and it is what keeps the guns firing.",
  },

  /* ---------- Aircraft ---------- */

  {
    id: "m3_halftrack",
    era: "ww2",
    name: "M3",
    displayName: "M3 Half-track",
    chassis: "halftrack",
    category: "transport",
    nations: ["usa", "uk", "ussr"],
    hp: 95,
    armor: LIGHT_ARMOR,
    mobility: { maxSpeed: 17, reverseSpeed: 6, accel: 7.4, turnRate: 1.05, turretTraverse: 0.7, turretArc: Math.PI },
    weapons: ["coax"],
    passengerSeats: 10,
    tint: 0x53603b,
    triangles: 850,
    blurb: "The Allied half-track. Square armoured nose, a ring-mounted .50, and room for a squad.",
  },
  {
    id: "sdkfz_7",
    era: "ww2",
    name: "SdKfz 7",
    displayName: "SdKfz 7 (8t) Half-track",
    chassis: "heavy_halftrack",
    category: "transport",
    nations: ["germany"],
    hp: 110,
    armor: UNARMORED,
    // Built to tow guns, not to fight: heavy, steady, and slow to change its mind.
    mobility: { maxSpeed: 14, reverseSpeed: 5, accel: 5.4, turnRate: 0.85, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 11,
    tint: 0x5c5a44,
    triangles: 950,
    blurb: "Eight-tonne artillery tractor. Unarmed and unarmoured, but it carries a whole gun crew.",
  },
  {
    id: "sdkfz_234_puma",
    era: "ww2",
    name: "Puma",
    displayName: "SdKfz 234/2 Puma",
    chassis: "heavy_armored_car",
    category: "armor",
    nations: ["germany"],
    hp: 95,
    armor: PUMA_ARMOR,
    // Eight driven wheels and a rear steering position — quick, and quick to leave.
    mobility: { maxSpeed: 23, reverseSpeed: 16, accel: 9.5, turnRate: 1.3, turretTraverse: 0.62, turretArc: Math.PI },
    weapons: ["cannon", "coax"],
    ammo: { ap: 28, he: 22 },
    passengerSeats: 1,
    tint: 0x4a4d45,
    triangles: 950,
    blurb: "8x8 with a 50 mm in a real turret. Reverses as fast as it advances — hit and run.",
  },
  {
    id: "t34_76",
    era: "ww2",
    name: "T-34",
    displayName: "T-34/76 Tank (Soviet)",
    chassis: "sloped_medium",
    category: "armor",
    nations: ["ussr"],
    hp: 155,
    armor: SLOPED_MEDIUM_ARMOR,
    mobility: { maxSpeed: 14.5, reverseSpeed: 5, accel: 6.2, turnRate: 0.8, turretTraverse: 0.42, turretArc: Math.PI },
    weapons: ["f34_76", "coax"],
    ammo: { ap: 30, he: 26 },
    passengerSeats: 4,
    tint: 0x4a5540,
    triangles: 1100,
    blurb: "Sloped plate everywhere and wide tracks. Faster than a Sherman, and the turret is cramped.",
  },

  /* ---------- Aircraft ---------- */
  {
    id: "p51_mustang",
    era: "ww2",
    name: "Mustang",
    displayName: "P-51D Mustang",
    chassis: "fighter",
    category: "air",
    nations: ["usa"],
    hp: 100,
    armor: UNARMORED,
    mobility: { maxSpeed: 128, reverseSpeed: 0, accel: 11, turnRate: 1.2, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x5d6647,
    triangles: 700,
    blurb: "Fast, long-legged escort fighter. Six .50s and the legs to follow bombers anywhere.",
  },
  {
    id: "spitfire_ix",
    era: "ww2",
    name: "Spitfire",
    displayName: "Supermarine Spitfire Mk IX",
    chassis: "fighter",
    category: "air",
    nations: ["uk"],
    hp: 96,
    armor: UNARMORED,
    mobility: { maxSpeed: 120, reverseSpeed: 0, accel: 11.5, turnRate: 1.45, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x59634a,
    triangles: 720,
    blurb: "Elliptical wings and a Merlin. Turns tighter than a Mustang, runs shorter.",
  },
  {
    id: "bf109_g",
    era: "ww2",
    name: "Bf 109",
    displayName: "Messerschmitt Bf 109 G",
    chassis: "fighter",
    category: "air",
    nations: ["germany"],
    hp: 92,
    armor: UNARMORED,
    mobility: { maxSpeed: 122, reverseSpeed: 0, accel: 12, turnRate: 1.3, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x6e7468,
    triangles: 680,
    blurb: "Small, light and quick to accelerate. Narrow gear and a heavy nose — land it carefully.",
  },
  {
    id: "fw190_a8",
    era: "ww2",
    name: "Fw 190",
    displayName: "Focke-Wulf Fw 190 A-8",
    chassis: "fighter",
    category: "air",
    nations: ["germany"],
    hp: 108,
    armor: UNARMORED,
    mobility: { maxSpeed: 118, reverseSpeed: 0, accel: 12.5, turnRate: 1.15, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x5a6350,
    triangles: 700,
    blurb: "Radial-engined and heavily armed. Rolls faster than anything; turns worse than everything.",
  },
  {
    id: "yak9",
    era: "ww2",
    name: "Yak-9",
    displayName: "Yakovlev Yak-9",
    chassis: "fighter",
    category: "air",
    nations: ["ussr"],
    hp: 94,
    armor: UNARMORED,
    mobility: { maxSpeed: 116, reverseSpeed: 0, accel: 11.8, turnRate: 1.4, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x4f5a42,
    triangles: 660,
    blurb: "Light, nimble and built for the deck. At low level nothing German turns with it.",
  },
  {
    id: "a6m_zero",
    era: "ww2",
    name: "Zero",
    displayName: "Mitsubishi A6M Zero",
    chassis: "fighter",
    category: "air",
    nations: ["japan"],
    hp: 78,
    armor: UNARMORED,
    // No armour and no self-sealing tanks: it out-turns everything and burns.
    mobility: { maxSpeed: 112, reverseSpeed: 0, accel: 12.2, turnRate: 1.7, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x5b6141,
    triangles: 680,
    blurb: "Turns inside anything alive. One burst anywhere near it and it is gone.",
  },
  {
    id: "f6f_hellcat",
    era: "ww2",
    name: "Hellcat",
    displayName: "Grumman F6F Hellcat",
    chassis: "fighter",
    category: "air",
    nations: ["usa"],
    hp: 118,
    armor: UNARMORED,
    mobility: { maxSpeed: 114, reverseSpeed: 0, accel: 11, turnRate: 1.25, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x39485a,
    triangles: 720,
    blurb: "Big, tough carrier fighter. Built to take hits a Zero cannot survive giving.",
  },
  {
    id: "a6m2n_rufe",
    era: "ww2",
    name: "Rufe",
    displayName: "A6M2-N Rufe",
    chassis: "floatplane",
    category: "air",
    nations: ["japan"],
    hp: 76,
    armor: UNARMORED,
    // A Zero with a boat bolted under it: everything costs speed.
    mobility: { maxSpeed: 96, reverseSpeed: 0, accel: 9.5, turnRate: 1.5, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon"],
    passengerSeats: 0,
    tint: 0x59633f,
    triangles: 760,
    blurb: "A Zero on floats. Slower for the drag, and it can sit down on water.",
  },
  {
    id: "ju87_stuka",
    era: "ww2",
    name: "Stuka",
    displayName: "Junkers Ju 87 D Stuka",
    chassis: "dive_bomber",
    category: "air",
    nations: ["germany"],
    hp: 110,
    armor: UNARMORED,
    mobility: { maxSpeed: 82, reverseSpeed: 0, accel: 8, turnRate: 1.0, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x6a7066,
    triangles: 780,
    blurb: "Inverted gull wings and fixed spats. Slow enough to be shot down, accurate enough to matter.",
  },
  {
    id: "il2_shturmovik",
    era: "ww2",
    name: "IL-2",
    displayName: "Ilyushin IL-2 Shturmovik",
    chassis: "attack_plane",
    category: "air",
    nations: ["ussr"],
    hp: 175,
    armor: LIGHT_ARMOR,
    // An armoured bathtub with wings — the only aircraft here that shrugs off ground fire.
    mobility: { maxSpeed: 88, reverseSpeed: 0, accel: 8.5, turnRate: 1.05, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x4a5348,
    triangles: 800,
    blurb: "The flying tank. Armoured around the pilot and the engine — ground fire mostly bounces.",
  },
  {
    id: "b25_mitchell",
    era: "ww2",
    name: "B-25",
    displayName: "B-25J Mitchell",
    chassis: "medium_bomber",
    category: "air",
    nations: ["usa", "ussr"],
    hp: 220,
    armor: UNARMORED,
    mobility: { maxSpeed: 90, reverseSpeed: 0, accel: 7, turnRate: 0.72, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x7a6f52,
    triangles: 950,
    blurb: "Twin-engined medium with a twin tail. Carries a real bomb load and defends itself.",
  },
  {
    id: "b17_fortress",
    era: "ww2",
    name: "B-17",
    displayName: "Boeing B-17G Flying Fortress",
    chassis: "heavy_bomber",
    category: "air",
    nations: ["usa"],
    hp: 340,
    armor: UNARMORED,
    mobility: { maxSpeed: 74, reverseSpeed: 0, accel: 5, turnRate: 0.5, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x5f664c,
    triangles: 1400,
    blurb: "Four engines and guns in every direction. Slow, enormous, and very hard to put down.",
  },
  {
    id: "lancaster",
    era: "ww2",
    name: "Lancaster",
    displayName: "Avro Lancaster",
    chassis: "heavy_bomber",
    category: "air",
    nations: ["uk"],
    hp: 330,
    armor: UNARMORED,
    mobility: { maxSpeed: 76, reverseSpeed: 0, accel: 5.2, turnRate: 0.52, turretTraverse: 0, turretArc: 0 },
    weapons: ["aircannon", "bomb"],
    passengerSeats: 0,
    tint: 0x4b5148,
    triangles: 1400,
    blurb: "The RAF's heavy. Twin fins, a cavernous bomb bay, and it flies at night for a reason.",
  },

  /* ================================================================ */
  /*  Great War roster                                                 */
  /* ================================================================ */

  /* ---------- Tanks ---------- */
  {
    id: "mark_iv_male",
    era: "ww1",
    name: "Mark IV",
    displayName: "British Mark IV (Male)",
    chassis: "rhomboid_tank",
    category: "armor",
    nations: ["britain_ww1"],
    hp: 150,
    armor: RIVETED_ARMOR,
    // Walking pace. The sponson guns barely traverse — you aim the whole tank.
    mobility: { maxSpeed: 4.4, reverseSpeed: 2.2, accel: 2.2, turnRate: 0.34, turretTraverse: 0.34, turretArc: 0.5 },
    weapons: ["sixpdr", "vickers_mg"],
    ammo: { ap: 22, he: 26 },
    passengerSeats: 2,
    tint: 0x8a7c52,
    triangles: 720,
    blurb: "8 m of riveted rhomboid. Two 6-pdr sponsons, no turret — you aim it by steering.",
  },
  {
    id: "mark_iv_female",
    era: "ww1",
    name: "Mark IV F",
    displayName: "British Mark IV (Female)",
    chassis: "rhomboid_tank",
    category: "armor",
    nations: ["britain_ww1"],
    hp: 150,
    armor: RIVETED_ARMOR,
    mobility: { maxSpeed: 4.6, reverseSpeed: 2.2, accel: 2.3, turnRate: 0.36, turretTraverse: 0.5, turretArc: 0.7 },
    // No cannon at all — the Female was built to sweep infantry off the tank.
    weapons: ["vickers_mg"],
    passengerSeats: 2,
    tint: 0x8a7c52,
    triangles: 700,
    blurb: "Same hull, machine guns only. Deadly to infantry, helpless against armour.",
  },
  {
    id: "a7v",
    era: "ww1",
    name: "A7V",
    displayName: "German A7V",
    chassis: "box_tank",
    category: "armor",
    nations: ["germany_ww1"],
    hp: 170,
    armor: A7V_ARMOR,
    mobility: { maxSpeed: 4.0, reverseSpeed: 2.0, accel: 2.0, turnRate: 0.3, turretTraverse: 0.3, turretArc: 0.42 },
    weapons: ["maxim57", "vickers_mg"],
    ammo: { ap: 20, he: 24 },
    passengerSeats: 4,
    tint: 0x4c4f4a,
    triangles: 640,
    blurb: "A moving blockhouse. Thickest armour of the war, and it tips over on any slope.",
  },

  /* ---------- Armored cars ---------- */
  {
    id: "rolls_royce_ac",
    era: "ww1",
    name: "Rolls-Royce",
    displayName: "British Rolls-Royce Armored Car",
    chassis: "vintage_armored_car",
    category: "armor",
    nations: ["britain_ww1"],
    hp: 70,
    armor: RIVETED_LIGHT,
    mobility: { maxSpeed: 17, reverseSpeed: 7, accel: 8, turnRate: 1.25, turretTraverse: 0.55, turretArc: Math.PI },
    weapons: ["vickers_mg"],
    passengerSeats: 2,
    tint: 0x7d7147,
    triangles: 480,
    blurb: "Riveted turret on a touring-car chassis. Fast on a road, useless off one.",
  },
  {
    id: "lancia_iz",
    era: "ww1",
    name: "Lancia IZ",
    displayName: "Lancia IZ Armored Car",
    chassis: "vintage_armored_car",
    category: "armor",
    nations: ["britain_ww1"],
    hp: 78,
    armor: RIVETED_LIGHT,
    mobility: { maxSpeed: 15.5, reverseSpeed: 6.5, accel: 7.4, turnRate: 1.15, turretTraverse: 0.5, turretArc: Math.PI },
    weapons: ["vickers_mg"],
    passengerSeats: 3,
    tint: 0x5c6348,
    triangles: 500,
    blurb: "Heavier Italian car with a taller body. Carries a section as well as its gun.",
  },
  {
    id: "austro_daimler_ac",
    era: "ww1",
    name: "Austro-Daimler",
    displayName: "Austro-Daimler Armored Car",
    chassis: "vintage_armored_car",
    category: "armor",
    nations: ["germany_ww1"],
    hp: 72,
    armor: RIVETED_LIGHT,
    mobility: { maxSpeed: 16, reverseSpeed: 7, accel: 7.8, turnRate: 1.3, turretTraverse: 0.55, turretArc: Math.PI },
    weapons: ["vickers_mg"],
    passengerSeats: 2,
    tint: 0x4f5349,
    triangles: 470,
    blurb: "Short and stubby with a domed turret. The Central Powers' scout car.",
  },

  /* ---------- Artillery and support ---------- */
  {
    id: "field_gun_75",
    era: "ww1",
    name: "75 mm Gun",
    displayName: "75mm Field Gun",
    chassis: "field_gun",
    category: "artillery",
    nations: ["britain_ww1", "germany_ww1"],
    hp: 55,
    armor: GUN_SHIELD,
    // Emplaced: it traverses on its trail but it does not go anywhere.
    mobility: { maxSpeed: 0, reverseSpeed: 0, accel: 0, turnRate: 0, turretTraverse: 0.42, turretArc: 0.55 },
    weapons: ["field_75"],
    ammo: { ap: 12, he: 40 },
    passengerSeats: 0,
    tint: 0x6a6b45,
    triangles: 300,
    blurb: "Quick-firing gun behind a thin shield. Devastating against infantry in the open.",
  },
  {
    id: "schneider_155",
    era: "ww1",
    name: "155 Howitzer",
    displayName: "Schneider 155mm Howitzer",
    chassis: "howitzer",
    category: "artillery",
    nations: ["britain_ww1", "germany_ww1"],
    hp: 70,
    armor: GUN_SHIELD,
    mobility: { maxSpeed: 0, reverseSpeed: 0, accel: 0, turnRate: 0, turretTraverse: 0.26, turretArc: 0.38 },
    weapons: ["howitzer_155"],
    ammo: { ap: 6, he: 30 },
    passengerSeats: 0,
    tint: 0x5e6242,
    triangles: 340,
    blurb: "Lobs a 43 kg shell. Thirteen seconds between rounds — make each one count.",
  },
  {
    id: "supply_wagon",
    era: "ww1",
    name: "Wagon",
    displayName: "Supply Wagon",
    chassis: "wagon",
    category: "artillery",
    nations: ["britain_ww1", "germany_ww1"],
    hp: 40,
    armor: UNARMORED,
    mobility: { maxSpeed: 4.5, reverseSpeed: 2, accel: 3, turnRate: 1.1, turretTraverse: 0, turretArc: 0 },
    weapons: [],
    passengerSeats: 4,
    tint: 0x6b4f2e,
    triangles: 220,
    blurb: "Four planks and two axles. Unarmed, unarmoured, and the only thing that moves the guns.",
  },

  /* ---------- Aircraft ---------- */
  {
    id: "sopwith_camel",
    era: "ww1",
    name: "Camel",
    displayName: "Sopwith Camel",
    chassis: "biplane",
    category: "air",
    nations: ["britain_ww1"],
    hp: 70,
    armor: UNARMORED,
    mobility: { maxSpeed: 52, reverseSpeed: 0, accel: 7, turnRate: 1.6, turretTraverse: 0, turretArc: 0 },
    weapons: ["air_mg"],
    passengerSeats: 0,
    tint: 0x8a7c52,
    triangles: 620,
    blurb: "Twitchy, torque-heavy and quick to turn right. Twin Vickers, no bombs.",
  },
  {
    id: "fokker_dr1",
    era: "ww1",
    name: "Dr.I",
    displayName: "Fokker Dr.I",
    chassis: "biplane",
    category: "air",
    nations: ["germany_ww1"],
    hp: 68,
    armor: UNARMORED,
    mobility: { maxSpeed: 48, reverseSpeed: 0, accel: 7.6, turnRate: 1.85, turretTraverse: 0, turretArc: 0 },
    weapons: ["air_mg"],
    passengerSeats: 0,
    tint: 0x6d4038,
    triangles: 660,
    blurb: "Slowest of the three and the tightest turner. Wins any fight it can drag into a circle.",
  },
  {
    id: "spad_xiii",
    era: "ww1",
    name: "SPAD XIII",
    displayName: "SPAD S.XIII",
    chassis: "biplane",
    category: "air",
    nations: ["britain_ww1"],
    hp: 76,
    armor: UNARMORED,
    mobility: { maxSpeed: 58, reverseSpeed: 0, accel: 8.2, turnRate: 1.35, turretTraverse: 0, turretArc: 0 },
    weapons: ["air_mg"],
    passengerSeats: 0,
    tint: 0x5c6348,
    triangles: 600,
    blurb: "Fast and steady but turns like a barn door. Fight it in a dive, never in a circle.",
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
/**
 * Weapon ids that behave as a vehicle main gun: single-shot, long reload,
 * shell-class projectile. Everything else a vehicle carries is a secondary.
 * Listed explicitly rather than inferred from the spec so adding a weapon
 * cannot silently reclassify an existing vehicle's armament.
 */
const CANNON_WEAPONS = new Set([
  "cannon", "sixpdr", "maxim57", "field_75", "howitzer_155",
  "type94_37", "type97_57", "type1_47", "type3_75",
  "f34_76", "zis_85", "d10_100", "d25t_122", "ml20_152", "zis_45", "katyusha_rocket",
]);

/** The main gun a vehicle fires, or null if it only has machine guns. */
export function mainGunOf(defId: string): string | null {
  return vehicleById(defId).weapons.find((w) => CANNON_WEAPONS.has(w)) ?? null;
}

/** The gun an aircraft fires — a 20 mm cannon in 1944, twin Vickers in 1917. */
export function airGunOf(defId: string): string {
  return vehicleById(defId).weapons.find((w) => w !== "bomb") ?? "aircannon";
}

/** The secondary/coaxial machine gun, or null if it has none. */
export function coaxOf(defId: string): string | null {
  return vehicleById(defId).weapons.find((w) => !CANNON_WEAPONS.has(w) && w !== "bomb") ?? null;
}

/** Aircraft chassis — spawned as Plane objects rather than parked vehicles. */
const AIR_CHASSIS: ReadonlySet<Chassis> = new Set<Chassis>([
  "fighter", "biplane", "dive_bomber", "attack_plane", "medium_bomber", "floatplane", "heavy_bomber",
]);

export function isAircraft(def: VehicleDef): boolean {
  return AIR_CHASSIS.has(def.chassis);
}

/** The spec `makePlane` needs, derived from a catalog entry. */
export function planeSpecOf(def: VehicleDef): {
  defId: string;
  hp: number;
  name: string;
  gun: string;
  bombs: number;
} {
  return {
    defId: def.id,
    hp: def.hp,
    name: def.name,
    gun: def.weapons.find((w) => w !== "bomb") ?? "aircannon",
    // No scout in 1917 carried a 100 kg bomb.
    bombs: def.weapons.includes("bomb") ? 2 : 0,
  };
}

export function mobilityOf(defId: string): Mobility {
  return vehicleById(defId).mobility;
}

export function armorOf(defId: string): ArmorScheme {
  return vehicleById(defId).armor;
}

/** Every vehicle a given side is allowed to field (its own plus shared ones). */
export function vehiclesForNation(nation: Nation, era: EraId = "ww2"): VehicleDef[] {
  return VEHICLES.filter((v) => v.era === era && v.nations.includes(nation));
}

export function vehiclesInCategory(
  nation: Nation,
  category: VehicleCategory,
  era: EraId = "ww2",
): VehicleDef[] {
  return vehiclesForNation(nation, era).filter((v) => v.category === category);
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
 * Which infantry weapons sit in which setup-screen group, per era. Ids match
 * the rosters registered in eras.ts; a new era adds an entry here to appear in
 * the menu. Eras with no infantry yet map to empty groups.
 */
const WEAPON_GROUPS_BY_ERA: Record<EraId, Record<WeaponGroup, string[]>> = {
  ww1: {
    rifles: ["smle_rifle", "gewehr98", "scoped_gewehr"],
    smgs: ["mp18", "trench_gun"],
    machine_guns: ["lewis_gun", "mg08_15"],
    anti_tank: ["tankgewehr", "grenade_bundle"],
    sidearms: ["webley", "luger"],
  },
  ww2: {
    rifles: ["bolt_rifle", "garand_rifle", "marksman_rifle", "marksman_semi"],
    smgs: ["smg", "smg_drum"],
    machine_guns: ["lmg", "lmg_light"],
    anti_tank: ["panzerfaust", "at_rifle"],
    sidearms: ["pistol", "revolver"],
  },
  coldwar: { rifles: [], smgs: [], machine_guns: [], anti_tank: [], sidearms: [] },
  modern: { rifles: [], smgs: [], machine_guns: [], anti_tank: [], sidearms: [] },
};

/**
 * A nation's small arms, grouped for the setup screen. Nations with their own
 * arsenal use it; the two Great War sides fall back to their era's shared
 * roster, which is the only place the era-level table is still read.
 */
export function weaponGroups(nation: Nation): Record<WeaponGroup, string[]> {
  return arsenalFor(nation)?.groups ?? WEAPON_GROUPS_BY_ERA[eraOfNation(nation)];
}

export function allWeaponIds(nation: Nation): string[] {
  return Object.values(weaponGroups(nation)).flat();
}

/** Which nation issues a weapon id, for validating saved loadouts. */
export function nationOfWeapon(weaponId: string): Nation | null {
  for (const era of Object.keys(NATIONS_OF_ERA) as EraId[]) {
    for (const nation of NATIONS_OF_ERA[era]) {
      if (allWeaponIds(nation).includes(weaponId)) return nation;
    }
  }
  return null;
}

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
  /** Which terrain recipe this map is generated from. See BIOMES in terrain.ts. */
  biome: string;
};

export const MAPS: MapDef[] = [
  {
    id: "valley",
    name: "Valley Sector",
    seed: 1337,
    blurb: "Three villages along a road through a shallow valley. Mixed arms.",
    tags: ["Balanced", "3 Points"],
    defaultPreset: "all_out",
    biome: "temperate",
  },
  {
    id: "bocage",
    name: "Bocage",
    seed: 90210,
    blurb: "Tight hedgerows and sunken lanes. Infantry country — armour gets ambushed.",
    tags: ["Close", "Infantry"],
    defaultPreset: "infantry_only",
    biome: "bocage",
  },
  {
    id: "steppe",
    name: "Open Steppe",
    seed: 4242,
    blurb: "Long sightlines and almost no cover. Tank and aircraft ground.",
    tags: ["Open", "Armor"],
    defaultPreset: "armor_clash",
    biome: "steppe",
  },
  {
    id: "coast",
    name: "Coastal Airfield",
    seed: 7777,
    blurb: "Airstrips, water crossings and a beach. Favours aircraft and amphibians.",
    tags: ["Air", "Water"],
    defaultPreset: "air_superiority",
    biome: "coast",
  },
  {
    id: "falcons_pass",
    name: "Falcon's Pass",
    seed: 24601,
    blurb: "An alpine river valley. Two bridges are the only way across — take one or swim.",
    tags: ["River", "Bridges"],
    defaultPreset: "all_out",
    biome: "alpine",
  },
  {
    id: "frost_hammer",
    name: "Frost-Hammer",
    seed: 8801,
    blurb: "The same pass under snow. Pale ground, close haze, and a freezing river.",
    tags: ["Winter", "River"],
    defaultPreset: "all_out",
    biome: "arctic",
  },
  {
    id: "frostguard_peaks",
    name: "Frost-Guard Peaks",
    seed: 19160,
    blurb: "Churned mud and dead trees. More shell hole than field, under a grey sky.",
    tags: ["Trenches", "Craters"],
    defaultPreset: "infantry_only",
    biome: "mud",
  },
  {
    id: "frostguard_trenches",
    name: "Frost-Guard Trenches",
    seed: 19171,
    blurb: "The same shelled ground under snow. Dead trunks, white craters and a frozen watercourse.",
    tags: ["Winter", "Craters"],
    defaultPreset: "infantry_only",
    biome: "snow_trench",
  },
  {
    id: "frostguard_summit",
    name: "Frost-Guard Summit",
    seed: 30720,
    blurb: "High alpine snow. Heavy pine on the flanks and a frozen lake filling the east.",
    tags: ["Winter", "Forest", "Lake"],
    defaultPreset: "all_out",
    biome: "alpine_snow",
  },
  {
    id: "atlantic_wall",
    name: "Atlantic Wall",
    seed: 6644,
    blurb: "Landing beach under the guns. Cross the sand, climb the bluff, take the hedgerows behind it.",
    tags: ["Beach", "Bunkers", "Trenches"],
    defaultPreset: "all_out",
    biome: "atlantic",
  },
  {
    id: "fortress_island",
    name: "Fortress Island",
    seed: 7391,
    blurb: "The same shore, harder. A battery on the headland and a shelled trench belt inland.",
    tags: ["Beach", "Bunkers", "Craters"],
    defaultPreset: "all_out",
    biome: "island",
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
  /** Display name, taken from the nation. */
  label: string;
  /** Which combatant this team fields. Decides the whole roster. */
  nation: Nation;
  /** Which engine team colour this side renders as. */
  team: Team;
  enabledWeapons: string[];
  enabledVehicles: string[];
  botCount: number;
  tickets: number;
  /** 0 = harmless, 1 = unpleasant. Feeds the AI accuracy/reaction model. */
  skill: number;
};

export { PLAYABLE_ERAS, ERA_LABEL, NATION_LABEL, NATION_SHORT, NATIONS_OF_ERA, SIDE_OF, defaultNations };
export type { EraId, Nation, Side };

export type MatchSettings = {
  /** Which era the match is fought in. Gates both the vehicle and weapon lists. */
  eraId: EraId;
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
  build: (era: EraId, nations: { team1: Nation; team2: Nation }) => {
    team1: TeamLoadout;
    team2: TeamLoadout;
  };
};

/** Every vehicle a side can field, by category filter. */
function vehiclesWhere(nation: Nation, era: EraId, pred: (v: VehicleDef) => boolean): string[] {
  return vehiclesForNation(nation, era).filter(pred).map((v) => v.id);
}

function baseTeam(nation: Nation, era: EraId, slot: "team1" | "team2"): TeamLoadout {
  return {
    label: NATION_SHORT[nation],
    nation,
    // Team colour follows the slot, not the nation, so a USA-vs-UK match still
    // has one blue side and one red one rather than two blues.
    team: slot === "team1" ? "blue" : "red",
    enabledWeapons: allWeaponIds(nation),
    enabledVehicles: vehiclesWhere(nation, era, () => true),
    botCount: 13,
    tickets: 320,
    skill: 0.55,
  };
}

/** Applies the same mutation to both sides, so presets stay symmetric. */
function bothTeams(
  era: EraId,
  nations: { team1: Nation; team2: Nation },
  mutate: (t: TeamLoadout, era: EraId) => void,
): { team1: TeamLoadout; team2: TeamLoadout } {
  const team1 = baseTeam(nations.team1, era, "team1");
  const team2 = baseTeam(nations.team2, era, "team2");
  mutate(team1, era);
  mutate(team2, era);
  return { team1, team2 };
}

export const PRESETS: Preset[] = [
  {
    id: "all_out",
    name: "All-Out Warfare",
    blurb: "Everything unlocked. Tanks, trucks, aircraft, the lot.",
    build: (era, nations) => bothTeams(era, nations, () => {}),
  },
  {
    id: "ww2_historical",
    name: "WW2 Historical",
    blurb: "Each side fields only what it historically operated. No shared kit.",
    build: (era, nations) =>
      bothTeams(era, nations, (t, e) => {
        // Drop anything marked as shared — historical mode is strict.
        t.enabledVehicles = vehiclesWhere(t.nation, e, (v) => v.nations.length === 1);
      }),
  },
  {
    id: "infantry_only",
    name: "Infantry Only",
    blurb: "No vehicles at all. Rifles, SMGs and the ground between you.",
    build: (era, nations) =>
      bothTeams(era, nations, (t) => {
        t.enabledVehicles = [];
        t.botCount = 18;
      }),
  },
  {
    id: "armor_clash",
    name: "Armor Clash",
    blurb: "Tanks and tank destroyers only. Bring AT weapons.",
    build: (era, nations) =>
      bothTeams(era, nations, (t, e) => {
        t.enabledVehicles = vehiclesWhere(t.nation, e, (v) => v.category === "armor" || v.category === "artillery");
        t.botCount = 10;
      }),
  },
  {
    id: "air_superiority",
    name: "Air Superiority",
    blurb: "Aircraft and light ground transport. The fight is overhead.",
    build: (era, nations) =>
      bothTeams(era, nations, (t, e) => {
        t.enabledVehicles = vehiclesWhere(t.nation, e, (v) => v.category === "air" || v.category === "light");
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

/** The nations a saved loadout was built for, read back off its teams. */
function nationsOf(l: MapLoadout): { team1: Nation; team2: Nation } {
  return { team1: l.teams.team1.nation, team2: l.teams.team2.nation };
}

/** Bumped whenever the saved shape changes, so old saves are discarded. */
const STORAGE_KEY = "claudefield.matchConfig.v2";

function cloneTeam(t: TeamLoadout): TeamLoadout {
  return { ...t, enabledWeapons: [...t.enabledWeapons], enabledVehicles: [...t.enabledVehicles] };
}

function defaultLoadout(map: MapDef, era: EraId, nations = defaultNations(era)): MapLoadout {
  return {
    seed: map.seed,
    presetId: map.defaultPreset,
    teams: presetById(map.defaultPreset).build(era, nations),
  };
}

/** Rosters are stored per era *and* per map, so switching era keeps both. */
function slotKey(era: EraId, mapId: string) {
  return `${era}:${mapId}`;
}

/**
 * Rebuilds one saved map entry, keeping only what the current catalog still
 * recognises. A save written before a weapon or vehicle was renamed must not
 * be able to put an unknown id into the spawner, so anything unrecognised is
 * dropped rather than trusted.
 */
function sanitizeLoadout(map: MapDef, era: EraId, raw: unknown): MapLoadout {
  const base = defaultLoadout(map, era);
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Partial<MapLoadout>;
  if (typeof r.seed === "number" && Number.isFinite(r.seed)) base.seed = Math.floor(r.seed);
  base.presetId = PRESETS.some((p) => p.id === r.presetId) ? (r.presetId as PresetId) : null;
  for (const slot of ["team1", "team2"] as const) {
    const saved = r.teams?.[slot];
    if (!saved) continue;
    const team = base.teams[slot];
    // The nation comes first: it decides which vehicle ids are even legal.
    if (typeof saved.nation === "string" && NATIONS_OF_ERA[era].includes(saved.nation as Nation)) {
      team.nation = saved.nation as Nation;
      team.label = NATION_SHORT[team.nation];
    }
    const allowedVehicles = new Set(vehiclesForNation(team.nation, era).map((v) => v.id));
    const allowedWeapons = allWeaponIds(team.nation);
    if (Array.isArray(saved.enabledWeapons)) {
      team.enabledWeapons = saved.enabledWeapons.filter((w) => allowedWeapons.includes(w));
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
  private eraId: EraId;
  private mapId: string;
  /** Keyed `era:map` — every era keeps its own roster for every map. */
  private slots = new Map<string, MapLoadout>();
  private listeners = new Set<(s: MatchSettings) => void>();

  constructor(startMapId: string = MAPS[0].id, startEra: EraId = "ww2") {
    this.eraId = PLAYABLE_ERAS.includes(startEra) ? startEra : PLAYABLE_ERAS[0];
    this.mapId = MAPS.some((m) => m.id === startMapId) ? startMapId : MAPS[0].id;
    for (const era of PLAYABLE_ERAS) {
      for (const m of MAPS) this.slots.set(slotKey(era, m.id), defaultLoadout(m, era));
    }
    this.load();
  }

  /* ---------------- persistence ---------------- */

  private load() {
    const raw = readStorage();
    if (!raw) return;
    if (typeof raw.eraId === "string" && PLAYABLE_ERAS.includes(raw.eraId as EraId)) {
      this.eraId = raw.eraId as EraId;
    }
    if (typeof raw.mapId === "string" && MAPS.some((m) => m.id === raw.mapId)) this.mapId = raw.mapId;
    const slots = raw.slots as Record<string, unknown> | undefined;
    if (!slots) return;
    for (const era of PLAYABLE_ERAS) {
      for (const m of MAPS) {
        const key = slotKey(era, m.id);
        const saved = slots[key];
        if (saved !== undefined) this.slots.set(key, sanitizeLoadout(m, era, saved));
      }
    }
  }

  private save() {
    writeStorage({ eraId: this.eraId, mapId: this.mapId, slots: Object.fromEntries(this.slots) });
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
    const l = this.slots.get(slotKey(this.eraId, this.mapId));
    if (!l) throw new Error(`matchConfig: no loadout for ${this.eraId} on "${this.mapId}"`);
    return l;
  }

  /** Deep copy, so callers can hold it without aliasing live state. */
  getMatchSettings(): MatchSettings {
    const l = this.current();
    return {
      eraId: this.eraId,
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
    const l = this.slots.get(slotKey(this.eraId, mapId)) ?? defaultLoadout(mapById(mapId), this.eraId);
    const t = l.teams.team1;
    return { vehicles: t.enabledVehicles.length, weapons: t.enabledWeapons.length, bots: t.botCount };
  }

  era(): EraId {
    return this.eraId;
  }

  /**
   * Changes which nation a team fields. The old nation's vehicles are not this
   * one's to fly, so the roster is rebuilt wholesale rather than filtered —
   * silently dropping a Spitfire when you switch to Japan would leave the team
   * looking configured when it is not.
   */
  setNation(slot: "team1" | "team2", nation: Nation) {
    if (!NATIONS_OF_ERA[this.eraId].includes(nation)) return;
    const l = this.current();
    const other = slot === "team1" ? "team2" : "team1";
    // Both sides cannot be the same nation — it would be one army fighting itself.
    if (l.teams[other].nation === nation) return;
    const previous = l.teams[slot];
    const rebuilt = baseTeam(nation, this.eraId, slot);
    // Numbers the player set are theirs; the kit all follows the nation —
    // carrying the old army's weapon list over would leave a Japanese squad
    // holding Thompsons.
    rebuilt.botCount = previous.botCount;
    rebuilt.tickets = previous.tickets;
    rebuilt.skill = previous.skill;
    l.teams[slot] = rebuilt;
    l.presetId = null;
    this.emit();
  }

  /**
   * Switches era. The previous era's rosters are left exactly as they were, so
   * flipping between 1917 and 1944 does not cost you either setup.
   */
  setEra(era: EraId) {
    if (!PLAYABLE_ERAS.includes(era)) return;
    this.eraId = era;
    this.emit();
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
    l.teams = presetById(id).build(this.eraId, nationsOf(l));
    l.presetId = id;
    this.emit();
  }

  /** Puts this map back to the roster it shipped with. */
  resetMap() {
    // Reset keeps the matchup — it is the roster that is being reset, not who
    // is fighting whom.
    this.slots.set(
      slotKey(this.eraId, this.mapId),
      defaultLoadout(mapById(this.mapId), this.eraId, nationsOf(this.current())),
    );
    this.emit();
  }

  /** Copies this map's roster onto every other map, seeds left alone. */
  copyToAllMaps() {
    const source = this.current();
    for (const m of MAPS) {
      if (m.id === this.mapId) continue;
      const target = this.slots.get(slotKey(this.eraId, m.id));
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
    const ids = weaponGroups(this.teamOf(slot).nation)[group];
    t.enabledWeapons = enabled
      ? Array.from(new Set([...t.enabledWeapons, ...ids]))
      : t.enabledWeapons.filter((w) => !ids.includes(w));
    this.markCustom();
    this.emit();
  }

  /** Select-All / Deselect-All for one vehicle category. */
  setVehicleCategory(slot: "team1" | "team2", category: VehicleCategory, enabled: boolean) {
    const t = this.teamOf(slot);
    const ids = vehiclesInCategory(t.nation, category, this.eraId).map((v) => v.id);
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
      const sidearms = weaponGroups(t.nation).sidearms;
      const hasPrimary = t.enabledWeapons.some((w) => !sidearms.includes(w));
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
function readStorage(): { eraId?: string; mapId?: string; slots?: unknown } | null {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as { eraId?: string; mapId?: string; slots?: unknown })
      : null;
  } catch {
    return null;
  }
}

function writeStorage(value: { eraId: EraId; mapId: string; slots: Record<string, MapLoadout> }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* full, disabled or unavailable — the menu still works, it just forgets. */
  }
}
