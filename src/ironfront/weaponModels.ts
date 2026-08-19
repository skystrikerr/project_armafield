import * as THREE from "three";
import { build, type Part } from "./models";
import { WEAPONS } from "./units";
import { weaponCategory } from "./eras";

/**
 * Infantry weapon meshes.
 *
 * Seventy-odd weapons is far too many to model individually, and at the size a
 * weapon occupies on screen most of them would be indistinguishable anyway.
 * What actually reads at arm's length is the silhouette: where the magazine
 * sits, whether there is a bipod, how long the barrel is, whether it has a
 * scope. So one builder takes a profile of exactly those things, and each
 * weapon names a profile — a Sten's magazine sticks out sideways, a Bren's
 * stands on top, a DP-28 wears a dinner plate, and all three are recognisable
 * from across a field.
 */

const WOOD = 0x6b4f2e;
const WOOD_DARK = 0x4c3720;
const GUNMETAL = 0x3a3d3f;
const STEEL_DARK = 0x33372f;
const BLUED = 0x24262a;
const CANVAS = 0x8b7c58;

/** Where the magazine lives — the single most recognisable thing about a gun. */
type MagStyle = "none" | "internal" | "down" | "long_down" | "side" | "top" | "drum" | "pan" | "belt";

type WeaponProfile = {
  kind: "gun" | "tube" | "pistol";
  /** Receiver length in metres; the barrel runs on past it. */
  body: number;
  barrel: number;
  barrelR: number;
  mag: MagStyle;
  stock: "full" | "half" | "folding" | "none";
  bipod?: boolean;
  scope?: boolean;
  /** Ventilated barrel shroud, as on a Sten, Thompson or MG 34. */
  shroud?: boolean;
  /** Tube weapons: the warhead cone on the front. */
  warhead?: "shaped" | "bomb" | "none";
  woodTone?: number;
  metalTone?: number;
};

function gun(over: Partial<WeaponProfile> = {}): WeaponProfile {
  return {
    kind: "gun", body: 0.6, barrel: 0.75, barrelR: 0.022,
    mag: "internal", stock: "full", ...over,
  };
}

/* ------------------------------------------------------------------ */
/*  Profiles                                                           */
/* ------------------------------------------------------------------ */

const PROFILES: Record<string, WeaponProfile> = {
  /* ---- United States ---- */
  m1_garand:      gun({ body: 0.62, barrel: 0.72 }),
  m1903:          gun({ body: 0.64, barrel: 0.82 }),
  m1_carbine:     gun({ body: 0.5, barrel: 0.5, mag: "down" }),
  m1903_scoped:   gun({ body: 0.64, barrel: 0.82, scope: true }),
  thompson_m1a1:  gun({ body: 0.46, barrel: 0.32, mag: "long_down", stock: "half", shroud: true }),
  m3_grease:      gun({ body: 0.38, barrel: 0.26, mag: "long_down", stock: "folding", metalTone: BLUED }),
  bar:            gun({ body: 0.66, barrel: 0.68, mag: "down", bipod: true }),
  m1919:          gun({ body: 0.6, barrel: 0.72, mag: "belt", stock: "none", bipod: true, shroud: true }),
  bazooka:        { kind: "tube", body: 1.5, barrel: 0, barrelR: 0.075, mag: "none", stock: "none", warhead: "shaped" },
  m1911:          { kind: "pistol", body: 0.2, barrel: 0.1, barrelR: 0.017, mag: "down", stock: "none" },
  m1917_revolver: { kind: "pistol", body: 0.18, barrel: 0.13, barrelR: 0.016, mag: "drum", stock: "none" },

  /* ---- United Kingdom ---- */
  smle_no1:       gun({ body: 0.64, barrel: 0.78, mag: "down" }),
  enfield_no4:    gun({ body: 0.62, barrel: 0.76, mag: "down" }),
  enfield_no5:    gun({ body: 0.52, barrel: 0.5, mag: "down" }),
  enfield_scoped: gun({ body: 0.62, barrel: 0.76, mag: "down", scope: true }),
  // The Sten's magazine sticks straight out of the left side. Nothing else does.
  sten_mk2:       gun({ body: 0.44, barrel: 0.32, mag: "side", stock: "none", metalTone: BLUED }),
  lanchester:     gun({ body: 0.5, barrel: 0.4, mag: "side", stock: "full", woodTone: WOOD }),
  thompson_uk:    gun({ body: 0.46, barrel: 0.32, mag: "drum", stock: "half", shroud: true }),
  // And the Bren's stands straight up out of the top.
  bren_lmg:       gun({ body: 0.6, barrel: 0.62, mag: "top", bipod: true }),
  vickers_hmg:    gun({ body: 0.56, barrel: 0.6, mag: "belt", stock: "none", bipod: true, shroud: true }),
  boys_at:        gun({ body: 0.78, barrel: 0.95, mag: "down", bipod: true, scope: true }),
  piat:           { kind: "tube", body: 0.95, barrel: 0, barrelR: 0.062, mag: "none", stock: "half", warhead: "bomb" },
  webley_mk6:     { kind: "pistol", body: 0.18, barrel: 0.15, barrelR: 0.016, mag: "drum", stock: "none" },
  enfield_no2:    { kind: "pistol", body: 0.17, barrel: 0.11, barrelR: 0.015, mag: "drum", stock: "none" },
  webley_auto:    { kind: "pistol", body: 0.2, barrel: 0.1, barrelR: 0.016, mag: "down", stock: "none" },

  /* ---- Soviet Union ---- */
  mosin:          gun({ body: 0.68, barrel: 0.86 }),
  mosin_carbine:  gun({ body: 0.56, barrel: 0.56 }),
  svt40:          gun({ body: 0.62, barrel: 0.66, mag: "down" }),
  mosin_scoped:   gun({ body: 0.68, barrel: 0.86, scope: true }),
  ppsh41:         gun({ body: 0.44, barrel: 0.34, mag: "drum", stock: "full", shroud: true }),
  pps43:          gun({ body: 0.42, barrel: 0.3, mag: "long_down", stock: "folding", metalTone: BLUED }),
  dp28:           gun({ body: 0.62, barrel: 0.7, mag: "pan", bipod: true }),
  maxim_m1910:    gun({ body: 0.6, barrel: 0.66, mag: "belt", stock: "none", bipod: true, shroud: true }),
  ptrd41:         gun({ body: 0.85, barrel: 1.15, mag: "internal", bipod: true }),
  tt33:           { kind: "pistol", body: 0.19, barrel: 0.1, barrelR: 0.015, mag: "down", stock: "none" },
  nagant_m1895:   { kind: "pistol", body: 0.17, barrel: 0.12, barrelR: 0.014, mag: "drum", stock: "none" },

  /* ---- Germany ---- */
  kar98k:         gun({ body: 0.6, barrel: 0.74 }),
  kar98k_carbine: gun({ body: 0.54, barrel: 0.6 }),
  gewehr98_rifle: gun({ body: 0.68, barrel: 0.9 }),
  g43:            gun({ body: 0.62, barrel: 0.68, mag: "down" }),
  kar98k_scoped:  gun({ body: 0.6, barrel: 0.74, scope: true }),
  mp40:           gun({ body: 0.42, barrel: 0.3, mag: "long_down", stock: "folding", metalTone: BLUED }),
  mp38:           gun({ body: 0.42, barrel: 0.3, mag: "long_down", stock: "folding", metalTone: BLUED }),
  mp28ii:         gun({ body: 0.48, barrel: 0.36, mag: "side", stock: "full", shroud: true }),
  mg34:           gun({ body: 0.62, barrel: 0.78, mag: "belt", stock: "half", bipod: true, shroud: true }),
  mg42:           gun({ body: 0.6, barrel: 0.74, mag: "belt", stock: "half", bipod: true, shroud: true }),
  panzerbuchse39: gun({ body: 0.8, barrel: 1.05, bipod: true }),
  panzerfaust60:  { kind: "tube", body: 0.85, barrel: 0, barrelR: 0.035, mag: "none", stock: "none", warhead: "shaped" },
  luger_p08:      { kind: "pistol", body: 0.19, barrel: 0.11, barrelR: 0.014, mag: "down", stock: "none" },
  walther_p38:    { kind: "pistol", body: 0.19, barrel: 0.1, barrelR: 0.015, mag: "down", stock: "none" },
  mauser_c96:     { kind: "pistol", body: 0.24, barrel: 0.14, barrelR: 0.014, mag: "internal", stock: "none" },

  /* ---- Japan ---- */
  arisaka_t38:    gun({ body: 0.7, barrel: 0.92 }),
  arisaka_t99:    gun({ body: 0.64, barrel: 0.78 }),
  type44_carbine: gun({ body: 0.54, barrel: 0.56 }),
  type2_para:     gun({ body: 0.58, barrel: 0.66 }),
  arisaka_scoped: gun({ body: 0.64, barrel: 0.8, scope: true }),
  type100_smg:    gun({ body: 0.46, barrel: 0.34, mag: "side", stock: "full", shroud: true }),
  type2_smg:      gun({ body: 0.42, barrel: 0.3, mag: "side", stock: "folding", metalTone: BLUED }),
  type11_lmg:     gun({ body: 0.6, barrel: 0.68, mag: "top", bipod: true, shroud: true }),
  type96_lmg:     gun({ body: 0.58, barrel: 0.64, mag: "top", bipod: true }),
  type92_hmg:     gun({ body: 0.6, barrel: 0.72, mag: "belt", stock: "none", bipod: true, shroud: true }),
  type97_at:      gun({ body: 0.82, barrel: 1.0, mag: "top", bipod: true }),
  type89_mortar:  { kind: "tube", body: 0.55, barrel: 0, barrelR: 0.05, mag: "none", stock: "none", warhead: "bomb" },
  nambu_t14:      { kind: "pistol", body: 0.2, barrel: 0.12, barrelR: 0.013, mag: "down", stock: "none" },
  nambu_t94:      { kind: "pistol", body: 0.17, barrel: 0.09, barrelR: 0.013, mag: "down", stock: "none" },
  type26_revolver:{ kind: "pistol", body: 0.17, barrel: 0.11, barrelR: 0.014, mag: "drum", stock: "none" },
};

/**
 * Anything without an explicit profile falls back to one derived from its
 * category, so a weapon added to the catalog still gets a sensible mesh before
 * anyone gets round to giving it a silhouette of its own.
 */
function profileFor(weaponId: string): WeaponProfile {
  const explicit = PROFILES[weaponId];
  if (explicit) return explicit;
  switch (weaponCategory(weaponId)) {
    case "smg":
      return gun({ body: 0.44, barrel: 0.32, mag: "long_down", stock: "half" });
    case "lmg":
      return gun({ body: 0.6, barrel: 0.68, mag: "down", bipod: true });
    case "marksman":
      return gun({ body: 0.64, barrel: 0.82, scope: true });
    case "heavy":
      return { kind: "tube", body: 1.2, barrel: 0, barrelR: 0.07, mag: "none", stock: "none", warhead: "shaped" };
    case "sidearm":
      return { kind: "pistol", body: 0.19, barrel: 0.11, barrelR: 0.015, mag: "down", stock: "none" };
    default:
      return gun();
  }
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

function magazineParts(parts: Part[], p: WeaponProfile, metal: number) {
  const z = p.body * 0.05;
  switch (p.mag) {
    case "down":
      parts.push({ g: "box", size: [0.05, 0.16, 0.09], pos: [0, -0.12, z], color: metal });
      break;
    case "long_down":
      parts.push({ g: "box", size: [0.045, 0.28, 0.075], pos: [0, -0.18, z], rot: [0.06, 0, 0], color: metal });
      break;
    case "side":
      // Straight out of the left side, horizontal — the Sten and the Type 100.
      parts.push({ g: "box", size: [0.26, 0.07, 0.05], pos: [-0.17, 0.01, z], color: metal });
      break;
    case "top":
      // Standing up out of the receiver — Bren, Type 96.
      parts.push({ g: "box", size: [0.05, 0.22, 0.08], pos: [0, 0.16, z], rot: [-0.08, 0, 0], color: metal });
      break;
    case "drum":
      parts.push({ g: "cyl", r: 0.105, h: 0.06, seg: 10, pos: [0, -0.09, z], rot: [0, 0, Math.PI / 2], color: metal });
      break;
    case "pan":
      // The DP-28's record player.
      parts.push({ g: "cyl", r: 0.135, h: 0.045, seg: 12, pos: [0, 0.11, z], color: metal });
      parts.push({ g: "cyl", r: 0.05, h: 0.05, seg: 8, pos: [0, 0.13, z], color: STEEL_DARK });
      break;
    case "belt":
      parts.push({ g: "box", size: [0.09, 0.1, 0.14], pos: [0.02, -0.07, z], color: STEEL_DARK });
      parts.push({ g: "box", size: [0.03, 0.05, 0.16], pos: [-0.06, -0.04, z + 0.02], rot: [0, 0, 0.3], color: CANVAS });
      break;
    case "internal":
    case "none":
      break;
  }
}

function gunGeometry(p: WeaponProfile): THREE.BufferGeometry {
  const wood = p.woodTone ?? WOOD;
  const woodDark = p.woodTone ? WOOD_DARK : WOOD_DARK;
  const metal = p.metalTone ?? GUNMETAL;
  const half = p.body / 2;
  const parts: Part[] = [
    // Receiver.
    { g: "box", size: [0.06, 0.085, p.body], pos: [0, 0, half * 0.4], color: p.metalTone ? metal : wood },
  ];
  // Stock.
  if (p.stock === "full") {
    parts.push(
      { g: "box", size: [0.062, 0.09, p.body * 0.6], pos: [0, -0.01, -half * 0.75], color: wood },
      { g: "box", size: [0.056, 0.15, 0.24], pos: [0, -0.075, -half * 1.25], rot: [0.22, 0, 0], color: woodDark },
      // Forend running under the barrel.
      { g: "box", size: [0.058, 0.06, p.barrel * 0.62], pos: [0, -0.02, half + p.barrel * 0.28], color: wood },
    );
  } else if (p.stock === "half") {
    parts.push(
      { g: "box", size: [0.056, 0.13, 0.22], pos: [0, -0.06, -half * 1.15], rot: [0.2, 0, 0], color: woodDark },
      { g: "box", size: [0.05, 0.07, 0.16], pos: [0, -0.02, half * 0.9], color: woodDark },
    );
  } else if (p.stock === "folding") {
    // A folding wire stock: two thin rails and a shoulder bar.
    parts.push(
      { g: "box", size: [0.015, 0.015, 0.26], pos: [0.032, -0.03, -half * 1.1], color: metal },
      { g: "box", size: [0.015, 0.015, 0.26], pos: [-0.032, -0.03, -half * 1.1], color: metal },
      { g: "box", size: [0.09, 0.02, 0.02], pos: [0, -0.03, -half * 1.1 - 0.13], color: metal },
    );
  }
  // Barrel, with an optional ventilated shroud around it.
  parts.push({
    g: "cyl", r: p.barrelR, h: p.barrel, seg: 6,
    pos: [0, 0.02, half + p.barrel / 2], rot: [Math.PI / 2, 0, 0], color: metal,
  });
  if (p.shroud) {
    parts.push({
      g: "cyl", r: p.barrelR * 2.1, h: p.barrel * 0.62, seg: 8,
      pos: [0, 0.02, half + p.barrel * 0.34], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK,
    });
  }
  // Pistol grip and trigger guard.
  parts.push({ g: "box", size: [0.05, 0.14, 0.075], pos: [0, -0.095, -half * 0.12], rot: [0.18, 0, 0], color: p.stock === "full" ? woodDark : metal });
  parts.push({ g: "box", size: [0.03, 0.045, 0.09], pos: [0, -0.045, half * 0.05], color: metal });
  magazineParts(parts, p, metal);
  if (p.bipod) {
    const bz = half + p.barrel * 0.78;
    for (const side of [-1, 1]) {
      parts.push({ g: "box", size: [0.012, 0.17, 0.012], pos: [side * 0.05, -0.09, bz], rot: [0, 0, side * 0.3], color: STEEL_DARK });
    }
  }
  if (p.scope) {
    parts.push(
      { g: "cyl", r: 0.028, h: 0.3, seg: 8, pos: [0, 0.1, half * 0.35], rot: [Math.PI / 2, 0, 0], color: BLUED },
      { g: "cyl", r: 0.036, h: 0.05, seg: 8, pos: [0, 0.1, half * 0.35 + 0.16], rot: [Math.PI / 2, 0, 0], color: BLUED },
      { g: "box", size: [0.016, 0.05, 0.02], pos: [0, 0.06, half * 0.35 - 0.09], color: STEEL_DARK },
    );
  } else {
    // Iron sights.
    parts.push({ g: "box", size: [0.035, 0.045, 0.02], pos: [0, 0.06, half + p.barrel - 0.03], color: metal });
    parts.push({ g: "box", size: [0.04, 0.03, 0.03], pos: [0, 0.055, half * 0.55], color: metal });
  }
  return build(parts);
}

function tubeGeometry(p: WeaponProfile): THREE.BufferGeometry {
  const parts: Part[] = [
    { g: "cyl", r: p.barrelR, h: p.body, seg: 8, pos: [0, 0, p.body * 0.22], rot: [Math.PI / 2, 0, 0], color: 0x4d5240 },
    { g: "cyl", r: p.barrelR * 1.5, h: p.body * 0.16, seg: 8, pos: [0, 0, -p.body * 0.26], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    { g: "box", size: [0.05, 0.15, 0.09], pos: [0, -0.11, -p.body * 0.06], rot: [0.16, 0, 0], color: 0x22241c },
  ];
  if (p.warhead === "shaped") {
    parts.push(
      { g: "cone", r: p.barrelR * 1.75, h: p.body * 0.24, seg: 8, pos: [0, 0, p.body * 0.78], rot: [Math.PI / 2, 0, 0], color: 0x6b3a2a },
      { g: "cyl", r: p.barrelR * 1.2, h: p.body * 0.1, seg: 8, pos: [0, 0, p.body * 0.64], rot: [Math.PI / 2, 0, 0], color: 0x5a3226 },
    );
  } else if (p.warhead === "bomb") {
    parts.push(
      { g: "cyl", r: p.barrelR * 1.4, h: p.body * 0.22, seg: 8, pos: [0, 0, p.body * 0.7], rot: [Math.PI / 2, 0, 0], color: 0x5a5a4a },
      { g: "cone", r: p.barrelR * 1.4, h: p.body * 0.14, seg: 8, pos: [0, 0, p.body * 0.86], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    );
  }
  if (p.stock === "half") {
    parts.push({ g: "box", size: [0.06, 0.12, 0.22], pos: [0, -0.06, -p.body * 0.45], rot: [0.2, 0, 0], color: WOOD_DARK });
  }
  return build(parts);
}

function pistolGeometry(p: WeaponProfile): THREE.BufferGeometry {
  const metal = p.metalTone ?? BLUED;
  const parts: Part[] = [
    { g: "box", size: [0.032, 0.075, p.body], pos: [0, 0.02, p.body * 0.1], color: metal },
    { g: "cyl", r: p.barrelR, h: p.barrel, seg: 6, pos: [0, 0.02, p.body * 0.6 + p.barrel * 0.4], rot: [Math.PI / 2, 0, 0], color: metal },
    { g: "box", size: [0.034, 0.13, 0.055], pos: [0, -0.08, -p.body * 0.2], rot: [0.3, 0, 0], color: WOOD_DARK },
    { g: "box", size: [0.02, 0.035, 0.06], pos: [0, -0.035, -p.body * 0.02], color: metal },
    { g: "box", size: [0.022, 0.025, 0.016], pos: [0, 0.062, p.body * 0.52], color: metal },
  ];
  if (p.mag === "drum") {
    // A revolver's cylinder.
    parts.push({ g: "cyl", r: 0.033, h: 0.07, seg: 8, pos: [0, 0.005, -p.body * 0.05], rot: [0, 0, Math.PI / 2], color: metal });
  }
  return build(parts);
}

/** The mesh for one weapon id. */
export function weaponGeometry(weaponId: string): THREE.BufferGeometry {
  const p = profileFor(weaponId);
  if (p.kind === "tube") return tubeGeometry(p);
  if (p.kind === "pistol") return pistolGeometry(p);
  return gunGeometry(p);
}

/** Where the weapon sits in the soldier's hands, per shape. */
export function weaponGrip(weaponId: string): [number, number, number] {
  const p = profileFor(weaponId);
  if (p.kind === "tube") return [0.06, -0.22, 0.2];
  if (p.kind === "pistol") return [0.05, -0.24, 0.3];
  return [0.06, -0.3, 0.22];
}

/** Every weapon id that has a mesh, for warming the cache up front. */
export function knownWeaponIds(): string[] {
  return Object.keys(WEAPONS);
}

/* ------------------------------------------------------------------ */
/*  Uniforms                                                           */
/* ------------------------------------------------------------------ */

/**
 * What an army looks like. Helmet shape is the strongest signal at range — a
 * Brodie's wide flat brim reads completely differently from a Stahlhelm's
 * flared skirt or a Japanese helmet's shallow dome — so each nation gets its
 * own, on top of its own tunic and webbing colours.
 */
export type UniformDef = {
  tunic: number;
  tunicDark: number;
  webbing: number;
  helmet: number;
  /** Brodie: wide flat brim. Stahlhelm: flared skirt. Dome: shallow, no brim. */
  helmetShape: "brodie" | "stahlhelm" | "dome" | "m1";
};

const UNIFORMS: Record<string, UniformDef> = {
  usa:     { tunic: 0x6b6a4e, tunicDark: 0x4e4d38, webbing: 0x8a8158, helmet: 0x5d6347, helmetShape: "m1" },
  uk:      { tunic: 0x6d6144, tunicDark: 0x4f4630, webbing: 0x8f8258, helmet: 0x5f6540, helmetShape: "brodie" },
  ussr:    { tunic: 0x6f6b4a, tunicDark: 0x514e34, webbing: 0x77704a, helmet: 0x4f5a3d, helmetShape: "dome" },
  germany: { tunic: 0x5c6156, tunicDark: 0x41453d, webbing: 0x3a3a34, helmet: 0x4c5049, helmetShape: "stahlhelm" },
  japan:   { tunic: 0x7a7350, tunicDark: 0x5a5439, webbing: 0x6b6444, helmet: 0x5f6641, helmetShape: "dome" },
};

const FALLBACK_UNIFORM: UniformDef = {
  tunic: 0x6b6a4e, tunicDark: 0x4e4d38, webbing: 0x8a8158, helmet: 0x5d6347, helmetShape: "brodie",
};

export function uniformFor(nation: string): UniformDef {
  return UNIFORMS[nation] ?? FALLBACK_UNIFORM;
}

const SKIN = 0xb08968;

/**
 * Torso, head and helmet in one nation's kit. `accent` is the team colour and
 * stays on the shoulders regardless of nation — with USA on one side and the
 * UK on the other, two armies in khaki need something that still tells them
 * apart at two hundred metres.
 */
export function soldierTorsoFor(nation: string, accent: number): THREE.BufferGeometry {
  const u = uniformFor(nation);
  const parts: Part[] = [
    { g: "box", size: [0.62, 0.72, 0.34], pos: [0, 0.36, 0], color: u.tunic },
    { g: "box", size: [0.66, 0.2, 0.38], pos: [0, 0.2, 0], color: u.tunicDark },
    { g: "box", size: [0.16, 0.16, 0.12], pos: [0.2, 0.2, 0.22], color: u.webbing },
    { g: "box", size: [0.16, 0.16, 0.12], pos: [-0.2, 0.2, 0.22], color: u.webbing },
    { g: "box", size: [0.44, 0.42, 0.2], pos: [0, 0.44, -0.26], color: u.webbing },
    // Shoulders carry the team colour so squads stay legible at range.
    { g: "box", size: [0.68, 0.14, 0.36], pos: [0, 0.66, 0], color: accent },
    { g: "box", size: [0.16, 0.1, 0.16], pos: [0, 0.78, 0], color: SKIN },
    { g: "box", size: [0.3, 0.3, 0.28], pos: [0, 0.96, 0], color: SKIN },
  ];
  switch (u.helmetShape) {
    case "brodie":
      // Shallow bowl on a wide flat brim — unmistakable at any range.
      parts.push(
        { g: "sphere", r: 0.2, seg: 8, pos: [0, 1.06, 0], color: u.helmet },
        { g: "cyl", r: 0.31, h: 0.035, seg: 10, pos: [0, 1.0, 0], color: u.helmet },
      );
      break;
    case "stahlhelm":
      // Deep shell with a flared skirt front and back.
      parts.push(
        { g: "sphere", r: 0.225, seg: 8, pos: [0, 1.08, 0], color: u.helmet },
        { g: "cyl", r: 0.25, r2: 0.235, h: 0.13, seg: 10, pos: [0, 1.0, 0], color: u.helmet },
        { g: "box", size: [0.36, 0.045, 0.44], pos: [0, 0.96, -0.02], color: u.helmet },
      );
      break;
    case "m1":
      // Rounder than a Brodie, with a short peak over the eyes.
      parts.push(
        { g: "sphere", r: 0.225, seg: 8, pos: [0, 1.07, 0], color: u.helmet },
        { g: "cyl", r: 0.245, h: 0.06, seg: 10, pos: [0, 1.0, 0], color: u.helmet },
        { g: "box", size: [0.3, 0.04, 0.12], pos: [0, 1.0, 0.2], color: u.helmet },
      );
      break;
    case "dome":
      // Shallow, close-fitting, almost no brim.
      parts.push(
        { g: "sphere", r: 0.215, seg: 8, pos: [0, 1.05, 0], color: u.helmet },
        { g: "cyl", r: 0.235, h: 0.04, seg: 10, pos: [0, 0.99, 0], color: u.helmet },
      );
      break;
  }
  return build(parts);
}

/** Arms in one nation's sleeve colour. */
export function soldierArmsFor(nation: string): THREE.BufferGeometry {
  const u = uniformFor(nation);
  return build([
    { g: "box", size: [0.17, 0.5, 0.19], pos: [0.36, -0.16, 0.06], rot: [-0.5, 0, 0.1], color: u.tunic },
    { g: "box", size: [0.17, 0.5, 0.19], pos: [-0.32, -0.16, 0.14], rot: [-0.9, 0, -0.15], color: u.tunic },
    { g: "box", size: [0.12, 0.12, 0.12], pos: [0.34, -0.32, 0.28], color: SKIN },
    { g: "box", size: [0.12, 0.12, 0.12], pos: [-0.26, -0.3, 0.44], color: SKIN },
  ]);
}

/** Legs in one nation's trouser colour. */
export function soldierLegFor(nation: string): THREE.BufferGeometry {
  const u = uniformFor(nation);
  return build([
    { g: "box", size: [0.19, 0.62, 0.22], pos: [0, -0.31, 0], color: u.tunicDark },
    { g: "box", size: [0.2, 0.16, 0.3], pos: [0, -0.66, 0.04], color: 0x2a251d },
  ]);
}
