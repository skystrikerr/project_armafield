import * as THREE from "three";

/** Teams, unit records and the stat tables the combat model reads from. */

export type Team = "blue" | "red";

export const TEAMS: Team[] = ["blue", "red"];

export function enemyOf(team: Team): Team {
  return team === "blue" ? "red" : "blue";
}

export const TEAM_COLOR: Record<Team, { primary: number; dark: number; light: number; hud: string }> = {
  blue: { primary: 0x4a6b8a, dark: 0x2e4256, light: 0x7d9ab5, hud: "#6ea8dc" },
  red: { primary: 0x8a5240, dark: 0x573224, light: 0xb5806a, hud: "#e0705a" },
};

export type Stance = "stand" | "crouch" | "prone";

/** Eye height above the feet, per stance. */
export const STANCE_EYE: Record<Stance, number> = { stand: 1.62, crouch: 1.08, prone: 0.42 };
export const STANCE_SPEED: Record<Stance, number> = { stand: 4.1, crouch: 2.1, prone: 0.9 };
/** Multiplier on incoming hit chance from AI: lying down is worth something. */
export const STANCE_EXPOSURE: Record<Stance, number> = { stand: 1, crouch: 0.72, prone: 0.42 };

export type WeaponId = string;

/** Soldier archetype id. Definitions live in eras.ts to keep the data out of this file. */
export type ClassId = "rifleman" | "assault" | "support" | "marksman" | "officer";

export type WeaponSpec = {
  name: string;
  /** Rounds per minute. 0 for single-use throwables. */
  rpm: number;
  /** Projectile muzzle speed, world units per second. */
  speed: number;
  /** Damage to a soldier on a body hit. */
  damage: number;
  /** Armour defeated at point blank, in millimetres. 0 = cannot hurt armour. */
  penetration: number;
  /** Explosive filler radius. 0 for solid shot. */
  blast: number;
  blastDamage: number;
  /** Base dispersion in radians at the muzzle. */
  spread: number;
  magazine: number;
  reloadTime: number;
  auto: boolean;
  tracer: number;
  /** Which low-poly mesh and AI stand-off distance this weapon reads as. Infantry only. */
  category?: "rifle" | "smg" | "lmg" | "marksman" | "heavy" | "sidearm";
  /** Camera kick per shot, in radians, and how fast it eases back out per second. */
  recoilKick?: number;
  recoilRecover?: number;
  /** Idle aim drift amplitude in radians, and its multiplier while aiming down sights. */
  swayAmount?: number;
  adsSwayMul?: number;
  /** Field-of-view divisor while aiming down sights. 1 = no zoom. */
  adsZoom?: number;
};

/**
 * Base table: universal and vehicle weapons only. Each era registers its own
 * infantry roster into this same object at load time (see eras.ts), so every
 * consumer here keeps resolving weapons through one generic `WEAPONS[id]`
 * lookup regardless of which era populated it.
 */
export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  grenade: {
    name: "Grenade",
    rpm: 0,
    speed: 20,
    damage: 0,
    penetration: 0,
    blast: 9,
    blastDamage: 130,
    spread: 0,
    magazine: 1,
    reloadTime: 1.2,
    auto: false,
    tracer: 0x8a8f7a,
  },
  cannon: {
    name: "75 mm",
    rpm: 12,
    speed: 265,
    damage: 100,
    penetration: 118,
    blast: 5,
    blastDamage: 110,
    spread: 0.0016,
    magazine: 1,
    reloadTime: 5.2,
    auto: false,
    tracer: 0xfff0c0,
  },
  coax: {
    name: "Coaxial MG",
    rpm: 700,
    speed: 460,
    damage: 30,
    penetration: 8,
    blast: 0,
    blastDamage: 0,
    spread: 0.014,
    magazine: 220,
    reloadTime: 4,
    auto: true,
    tracer: 0xffd08a,
  },
  aircannon: {
    name: "20 mm Cannon",
    rpm: 620,
    speed: 520,
    damage: 55,
    penetration: 26,
    blast: 1.6,
    blastDamage: 30,
    spread: 0.009,
    magazine: 180,
    reloadTime: 6,
    auto: true,
    tracer: 0xfff2a0,
  },
  /* ---------------- Great War vehicle armament ---------------- */
  sixpdr: {
    name: "6-pdr",
    rpm: 8,
    speed: 170,
    damage: 92,
    penetration: 48,
    blast: 3.4,
    blastDamage: 80,
    spread: 0.0034,
    magazine: 1,
    reloadTime: 7.5,
    auto: false,
    tracer: 0xffe8b0,
  },
  maxim57: {
    name: "5.7 cm Maxim-Nordenfelt",
    rpm: 9,
    speed: 175,
    damage: 90,
    penetration: 45,
    blast: 3.2,
    blastDamage: 78,
    spread: 0.0036,
    magazine: 1,
    reloadTime: 7.2,
    auto: false,
    tracer: 0xffe8b0,
  },
  /** Water-cooled MG. Slower and less accurate than a WWII coaxial. */
  vickers_mg: {
    name: "Vickers MG",
    rpm: 450,
    speed: 420,
    damage: 28,
    penetration: 6,
    blast: 0,
    blastDamage: 0,
    spread: 0.02,
    magazine: 250,
    reloadTime: 5.5,
    auto: true,
    tracer: 0xffd08a,
  },
  /** Towed 75 mm. Shrapnel and HE — murder on infantry, poor against armour. */
  field_75: {
    name: "75 mm Field Gun",
    rpm: 14,
    speed: 230,
    damage: 80,
    penetration: 34,
    blast: 8,
    blastDamage: 165,
    spread: 0.0022,
    magazine: 1,
    reloadTime: 4.4,
    auto: false,
    tracer: 0xfff0c0,
  },
  /** Heavy howitzer. Long reload, lobbed trajectory, enormous blast. */
  howitzer_155: {
    name: "155 mm Howitzer",
    rpm: 3,
    speed: 165,
    damage: 120,
    penetration: 48,
    blast: 16,
    blastDamage: 300,
    spread: 0.005,
    magazine: 1,
    reloadTime: 13,
    auto: false,
    tracer: 0xffe0a0,
  },
  /** Synchronised biplane MG. There is no 20 mm in 1917. */
  air_mg: {
    name: "Twin Vickers",
    rpm: 520,
    speed: 430,
    damage: 34,
    penetration: 9,
    blast: 0,
    blastDamage: 0,
    spread: 0.011,
    magazine: 200,
    reloadTime: 6,
    auto: true,
    tracer: 0xfff2a0,
  },
  bomb: {
    name: "100 kg Bomb",
    rpm: 0,
    speed: 0,
    damage: 0,
    penetration: 160,
    blast: 17,
    blastDamage: 260,
    spread: 0,
    magazine: 1,
    reloadTime: 1.5,
    auto: false,
    tracer: 0x555555,
  },
};

/** Shell types the tank can load. War Thunder's basic dilemma, in miniature. */
export type ShellType = "ap" | "he";

export const SHELLS: Record<ShellType, { name: string; penetration: number; blast: number; blastDamage: number; damage: number }> = {
  ap: { name: "APCBC", penetration: 118, blast: 1.4, blastDamage: 30, damage: 105 },
  he: { name: "HE", penetration: 26, blast: 8.5, blastDamage: 150, damage: 45 },
};

export type TankModule = "engine" | "tracks" | "gunner" | "driver" | "ammo";

export const MODULE_LABEL: Record<TankModule, string> = {
  engine: "Engine",
  tracks: "Tracks",
  gunner: "Gunner",
  driver: "Driver",
  ammo: "Ammo rack",
};

export type Soldier = {
  kind: "soldier";
  id: number;
  team: Team;
  isPlayer: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Facing of the body; the head/weapon track `aimYaw` on top of it. */
  yaw: number;
  aimYaw: number;
  aimPitch: number;
  stance: Stance;
  hp: number;
  alive: boolean;
  respawnAt: number;
  stamina: number;
  sprinting: boolean;
  onGround: boolean;
  classId: ClassId;
  /** Weapon ids this soldier carries, in number-key order. Index 0 is the primary. */
  loadout: string[];
  weapon: string;
  ammo: Record<string, number>;
  mags: Record<string, number>;
  grenades: number;
  reloadUntil: number;
  nextShotAt: number;
  /** Muzzle flash timer, seconds remaining. */
  flash: number;
  /** Walk cycle phase, for the leg animation. */
  gait: number;
  suppression: number;
  /** AI only. */
  ai: SoldierBrain | null;
  /** Set while riding in a vehicle. */
  ridingId: number | null;
  kills: number;
  deaths: number;
  name: string;
};

export type SoldierBrain = {
  state: "advance" | "engage" | "cover" | "regroup";
  targetId: number | null;
  goal: THREE.Vector3;
  nextThink: number;
  nextLos: number;
  hasLos: boolean;
  burstUntil: number;
  burstCooldown: number;
  zoneId: string;
  strafe: number;
  coverUntil: number;
};

export type Tank = {
  kind: "tank";
  id: number;
  team: Team;
  pos: THREE.Vector3;
  /** Hull heading. */
  yaw: number;
  pitch: number;
  roll: number;
  /** Turret azimuth, relative to the hull. */
  turret: number;
  barrel: number;
  speed: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  modules: Record<TankModule, number>;
  shell: ShellType;
  ammo: Record<ShellType, number>;
  coaxAmmo: number;
  reloadUntil: number;
  nextCoaxAt: number;
  flash: number;
  /** Distance travelled, for the track-texture scroll and dust. */
  odo: number;
  driverId: number | null;
  isPlayer: boolean;
  ai: TankBrain | null;
  name: string;
  kills: number;
  /**
   * Catalog id from matchConfig (e.g. "m4_sherman"). Every stat that varies
   * between vehicles — armour, speed, turret arc, mesh — is looked up from
   * that entry rather than stored here, so the catalog stays authoritative.
   */
  defId: string;
  /** Soldier ids currently riding in the troop bed. Empty for gun tanks. */
  passengerIds: number[];
};

export type TankBrain = {
  state: "advance" | "engage" | "reverse";
  targetId: number | null;
  goal: THREE.Vector3;
  nextThink: number;
  nextLos: number;
  hasLos: boolean;
  zoneId: string;
  reverseUntil: number;
  stuckFor: number;
  lastPos: THREE.Vector3;
};

export type Plane = {
  kind: "plane";
  id: number;
  /** Catalog id from matchConfig (e.g. "sopwith_camel"). Drives mesh and guns. */
  defId: string;
  team: Team;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Orientation is carried as a quaternion: aircraft need real roll. */
  quat: THREE.Quaternion;
  throttle: number;
  speed: number;
  hp: number;
  alive: boolean;
  respawnAt: number;
  ammo: number;
  bombs: number;
  nextShotAt: number;
  flash: number;
  onGround: boolean;
  pilotId: number | null;
  isPlayer: boolean;
  ai: PlaneBrain | null;
  name: string;
  kills: number;
};

export type PlaneBrain = {
  state: "climb" | "cruise" | "attack" | "pull";
  targetId: number | null;
  nextThink: number;
  goal: THREE.Vector3;
  pullUntil: number;
};

export type Unit = Soldier | Tank | Plane;

export type Vehicle = Tank | Plane;

export function isVehicle(u: Unit): u is Vehicle {
  return u.kind === "tank" || u.kind === "plane";
}

export const TANK_HULL = { hw: 1.65, hh: 0.75, hd: 3.2, y: 1.05 };
export const TANK_TURRET = { hw: 1.15, hh: 0.5, hd: 1.45, y: 1.93, z: -0.25 };
/** Height of the turret ring above the hull origin, and of the gun trunnion. */
export const TANK_RING_Y = 1.45;
export const TANK_GUN_Y = 1.95;

/**
 * Speed, acceleration, turn rate, traverse and armour are no longer global:
 * each vehicle carries its own in the matchConfig catalog, read via
 * `mobilityOf()` / `armorOf()`. Only the geometry the collision boxes and
 * rigs depend on stays fixed here.
 */
export const BARREL_RATE = 0.34;
export const BARREL_MIN = -0.16;
export const BARREL_MAX = 0.31;

export const PLANE_MAX_SPEED = 118;
export const PLANE_STALL_SPEED = 26;

const FIRST = [
  "Ash", "Bell", "Cole", "Dane", "Ester", "Flint", "Gale", "Harlow", "Ives",
  "Jory", "Kade", "Lark", "Mercer", "Nell", "Orin", "Pike", "Quill", "Rook",
  "Sable", "Tarn", "Vale", "Wren", "Yarrow", "Zell",
];
const LAST = [
  "Adler", "Brant", "Cortez", "Dray", "Eberle", "Faust", "Grisham", "Holt",
  "Ilyin", "Jansen", "Koval", "Lund", "Marsh", "Novak", "Osei", "Petrov",
  "Reyes", "Stahl", "Thorne", "Ulrich", "Vetter", "Weiss",
];

export function callsign(n: number) {
  return `${FIRST[n % FIRST.length]} ${LAST[(n * 7 + 3) % LAST.length]}`;
}

export function makeSoldier(id: number, team: Team, pos: THREE.Vector3, isPlayer: boolean): Soldier {
  return {
    kind: "soldier",
    id,
    team,
    isPlayer,
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    aimYaw: 0,
    aimPitch: 0,
    stance: "stand",
    hp: 100,
    alive: true,
    respawnAt: 0,
    stamina: 100,
    sprinting: false,
    onGround: true,
    // Left empty: the caller equips a class immediately via `equipSoldier`
    // (eras.ts) before the soldier ever takes a frame of simulation.
    classId: "rifleman",
    loadout: [],
    weapon: "",
    ammo: {},
    mags: {},
    grenades: 0,
    reloadUntil: 0,
    nextShotAt: 0,
    flash: 0,
    gait: 0,
    suppression: 0,
    ai: null,
    ridingId: null,
    kills: 0,
    deaths: 0,
    name: isPlayer ? "You" : callsign(id),
  };
}

/**
 * Builds a ground vehicle. `spec` carries the bits that vary per catalog
 * entry; callers normally pass values straight out of a VehicleDef so the
 * two never drift apart.
 */
export function makeTank(
  id: number,
  team: Team,
  pos: THREE.Vector3,
  yaw: number,
  spec: { defId: string; hp: number; name: string; ammo?: { ap: number; he: number } } = {
    defId: "m4_sherman",
    hp: 100,
    name: "Tank",
  },
): Tank {
  return {
    kind: "tank",
    id,
    team,
    pos: pos.clone(),
    yaw,
    pitch: 0,
    roll: 0,
    turret: 0,
    barrel: 0,
    speed: 0,
    hp: spec.hp,
    alive: true,
    respawnAt: 0,
    modules: { engine: 100, tracks: 100, gunner: 100, driver: 100, ammo: 100 },
    shell: "ap",
    ammo: { ...(spec.ammo ?? { ap: 42, he: 24 }) },
    coaxAmmo: WEAPONS.coax.magazine,
    reloadUntil: 0,
    nextCoaxAt: 0,
    flash: 0,
    odo: 0,
    driverId: null,
    isPlayer: false,
    ai: null,
    name: `${spec.name}-${id % 90}`,
    kills: 0,
    defId: spec.defId,
    passengerIds: [],
  };
}

export function makePlane(
  id: number,
  team: Team,
  pos: THREE.Vector3,
  heading: number,
  spec: { defId: string; hp: number; name: string; gun: string; bombs: number } = {
    defId: "fighter_allied",
    hp: 100,
    name: "Fighter",
    gun: "aircannon",
    bombs: 2,
  },
): Plane {
  return {
    kind: "plane",
    id,
    defId: spec.defId,
    team,
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, heading, 0, "YXZ")),
    throttle: 0,
    speed: 0,
    hp: spec.hp,
    alive: true,
    respawnAt: 0,
    ammo: WEAPONS[spec.gun].magazine,
    bombs: spec.bombs,
    nextShotAt: 0,
    flash: 0,
    onGround: true,
    pilotId: null,
    isPlayer: false,
    ai: null,
    name: `${spec.name}-${id % 90}`,
    kills: 0,
  };
}
