import type { WeaponSpec } from "./units";
import type { ClassDef } from "./eras";

/**
 * Per-nation WWII small arms and the squads that carry them.
 *
 * Every nation fields its own rifle, its own SMG, its own machine gun and its
 * own way of dealing with a tank, because that is most of what made one army
 * feel unlike another on the ground. The stats are tuned against each other
 * rather than to any table: a PPSh throws more lead than anything else here
 * and cannot hit a barn past thirty metres, an MG 42 fires twice as fast as a
 * Bren and is twice as hard to hold, and a Panzerfaust will open any tank in
 * the game exactly once.
 *
 * Generated shape, hand-tuned values. Adding a nation means adding one entry.
 */

export type NationArsenal = {
  /** Adjective used in class names and the deploy screen. */
  label: string;
  /** The grenade this army throws. */
  grenade: string;
  weapons: Record<string, WeaponSpec>;
  classes: ClassDef[];
  /** Setup-screen grouping for this nation's small arms. */
  groups: {
    rifles: string[];
    smgs: string[];
    machine_guns: string[];
    anti_tank: string[];
    sidearms: string[];
  };
};

/* ------------------------------------------------------------------ */
/*  American                                                        */
/* ------------------------------------------------------------------ */

const USA_WEAPONS: Record<string, WeaponSpec> = {
  m1911: { name: "M1911", rpm: 140, speed: 320, damage: 36, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 7, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  m1917_revolver: { name: "M1917 Revolver", rpm: 100, speed: 320, damage: 37, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 6, reloadTime: 2.9, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  thompson_m1a1: { name: "Thompson M1A1", rpm: 700, speed: 370, damage: 31, penetration: 0, blast: 0, blastDamage: 0, spread: 0.026, magazine: 30, reloadTime: 3.0, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  m3_grease: { name: "M3 Grease Gun", rpm: 450, speed: 370, damage: 31, penetration: 0, blast: 0, blastDamage: 0, spread: 0.029, magazine: 30, reloadTime: 3.2, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  m1_garand: { name: "M1 Garand", rpm: 180, speed: 495, damage: 48, penetration: 0, blast: 0, blastDamage: 0, spread: 0.007, magazine: 8, reloadTime: 2.8, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.034, recoilRecover: 6.0, swayAmount: 0.0065, adsZoom: 1.55, adsSwayMul: 0.38 },
  m1903: { name: "M1903 Springfield", rpm: 35, speed: 510, damage: 59, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 3.6, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  m1_carbine: { name: "M1 Carbine", rpm: 220, speed: 495, damage: 36, penetration: 0, blast: 0, blastDamage: 0, spread: 0.007, magazine: 15, reloadTime: 2.6, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.026, recoilRecover: 6.0, swayAmount: 0.0065, adsZoom: 1.55, adsSwayMul: 0.38 },
  m1903_scoped: { name: "Scoped M1903", rpm: 32, speed: 545, damage: 91, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0016, magazine: 5, reloadTime: 3.8, auto: false, tracer: 0xffd08a, category: "marksman", recoilKick: 0.062, recoilRecover: 3.6, swayAmount: 0.0042, adsZoom: 4.2, adsSwayMul: 0.16 },
  bar: { name: "BAR", rpm: 550, speed: 465, damage: 40, penetration: 2, blast: 0, blastDamage: 0, spread: 0.017, magazine: 20, reloadTime: 4.2, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  m1919: { name: "M1919 Browning", rpm: 500, speed: 490, damage: 39, penetration: 5, blast: 0, blastDamage: 0, spread: 0.016, magazine: 250, reloadTime: 8.0, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.013, recoilRecover: 5.5, swayAmount: 0.022, adsZoom: 1.15, adsSwayMul: 0.7 },
  bazooka: { name: "M1 Bazooka", rpm: 5, speed: 84, damage: 60, penetration: 120, blast: 6, blastDamage: 175, spread: 0.012, magazine: 1, reloadTime: 6.0, auto: false, tracer: 0x8a8f7a, category: "heavy", recoilKick: 0.12, recoilRecover: 3.0, swayAmount: 0.016, adsZoom: 1.3, adsSwayMul: 0.45 },
  mk2_grenade: { name: "Mk 2 Grenade", rpm: 0, speed: 21, damage: 0, penetration: 0, blast: 9, blastDamage: 132, spread: 0, magazine: 1, reloadTime: 1.2, auto: false, tracer: 0x8a8f7a, category: "heavy" },
};

const USA_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A service rifle and a sidearm. The baseline.",
    loadout: ["m1_garand", "m1911"],
    slotOptions: { 0: ["m1_garand", "m1903", "m1_carbine"], 1: ["m1911", "m1917_revolver"] },
    reserve: { m1_garand: 6, m1903: 6, m1_carbine: 6, m1911: 2, m1917_revolver: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "A submachine gun and a sidearm. Close range, quicker on foot.",
    loadout: ["thompson_m1a1", "m1911"],
    slotOptions: { 0: ["thompson_m1a1", "m3_grease"], 1: ["m1911", "m1917_revolver"] },
    reserve: { thompson_m1a1: 4, m3_grease: 4, m1911: 2, m1917_revolver: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "An automatic and something that opens armour.",
    loadout: ["bar", "bazooka", "m1911"],
    slotOptions: { 0: ["bar", "m1919"], 1: ["bazooka"], 2: ["m1911", "m1917_revolver"] },
    reserve: { bar: 3, m1919: 3, bazooka: 2, m1911: 2, m1917_revolver: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["m1903_scoped", "m1911"],
    slotOptions: { 0: ["m1903_scoped"], 1: ["m1911", "m1917_revolver"] },
    reserve: { m1903_scoped: 6, m1911: 2, m1917_revolver: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A sidearm and a rifle. Leads from the front.",
    loadout: ["m1911", "m1_garand"],
    slotOptions: { 0: ["m1911", "m1917_revolver"], 1: ["m1_garand", "m1903", "m1_carbine"] },
    reserve: { m1911: 2, m1917_revolver: 2, m1_garand: 6, m1903: 6, m1_carbine: 6 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/*  British                                                        */
/* ------------------------------------------------------------------ */

const UK_WEAPONS: Record<string, WeaponSpec> = {
  webley_mk6: { name: "Webley Mk VI", rpm: 95, speed: 320, damage: 38, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 6, reloadTime: 2.9, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.044, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  enfield_no2: { name: "Enfield No. 2", rpm: 115, speed: 320, damage: 32, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 6, reloadTime: 2.7, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  webley_auto: { name: "Webley & Scott", rpm: 150, speed: 320, damage: 34, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 8, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  sten_mk2: { name: "Sten Mk II", rpm: 550, speed: 370, damage: 25, penetration: 0, blast: 0, blastDamage: 0, spread: 0.03, magazine: 32, reloadTime: 2.8, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  lanchester: { name: "Lanchester", rpm: 600, speed: 370, damage: 27, penetration: 0, blast: 0, blastDamage: 0, spread: 0.023, magazine: 50, reloadTime: 3.4, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.016, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  thompson_uk: { name: "Thompson", rpm: 700, speed: 370, damage: 31, penetration: 0, blast: 0, blastDamage: 0, spread: 0.027, magazine: 30, reloadTime: 3.2, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.022, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  smle_no1: { name: "Lee-Enfield No. 1", rpm: 40, speed: 510, damage: 56, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 10, reloadTime: 4.4, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  enfield_no4: { name: "Lee-Enfield No. 4", rpm: 45, speed: 510, damage: 57, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 10, reloadTime: 4.2, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  enfield_no5: { name: "No. 5 Jungle Carbine", rpm: 48, speed: 470, damage: 54, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0068, magazine: 10, reloadTime: 4.0, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.07, recoilRecover: 4.8, swayAmount: 0.0058, adsZoom: 1.5, adsSwayMul: 0.36 },
  enfield_scoped: { name: "Scoped No. 4", rpm: 32, speed: 545, damage: 88, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0016, magazine: 5, reloadTime: 4.0, auto: false, tracer: 0xffd08a, category: "marksman", recoilKick: 0.062, recoilRecover: 3.6, swayAmount: 0.0042, adsZoom: 4.2, adsSwayMul: 0.16 },
  bren_lmg: { name: "Bren Gun", rpm: 500, speed: 465, damage: 37, penetration: 2, blast: 0, blastDamage: 0, spread: 0.015, magazine: 30, reloadTime: 4.8, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  vickers_hmg: { name: "Vickers MG", rpm: 450, speed: 490, damage: 39, penetration: 5, blast: 0, blastDamage: 0, spread: 0.016, magazine: 250, reloadTime: 8.5, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.013, recoilRecover: 5.5, swayAmount: 0.022, adsZoom: 1.15, adsSwayMul: 0.7 },
  boys_at: { name: "Boys AT Rifle", rpm: 11, speed: 760, damage: 98, penetration: 23, blast: 0, blastDamage: 0, spread: 0.005, magazine: 5, reloadTime: 5.0, auto: false, tracer: 0xffe0b0, category: "heavy", recoilKick: 0.16, recoilRecover: 2.4, swayAmount: 0.02, adsZoom: 2.4, adsSwayMul: 0.3 },
  piat: { name: "PIAT", rpm: 5, speed: 76, damage: 60, penetration: 110, blast: 5.5, blastDamage: 165, spread: 0.012, magazine: 1, reloadTime: 6.2, auto: false, tracer: 0x8a8f7a, category: "heavy", recoilKick: 0.12, recoilRecover: 3.0, swayAmount: 0.016, adsZoom: 1.3, adsSwayMul: 0.45 },
  mills_bomb: { name: "Mills Bomb No. 36M", rpm: 0, speed: 21, damage: 0, penetration: 0, blast: 9, blastDamage: 135, spread: 0, magazine: 1, reloadTime: 1.2, auto: false, tracer: 0x8a8f7a, category: "heavy" },
};

const UK_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A service rifle and a sidearm. The baseline.",
    loadout: ["smle_no1", "webley_mk6"],
    slotOptions: { 0: ["smle_no1", "enfield_no4", "enfield_no5"], 1: ["webley_mk6", "enfield_no2", "webley_auto"] },
    reserve: { smle_no1: 6, enfield_no4: 6, enfield_no5: 6, webley_mk6: 2, enfield_no2: 2, webley_auto: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "A submachine gun and a sidearm. Close range, quicker on foot.",
    loadout: ["sten_mk2", "webley_mk6"],
    slotOptions: { 0: ["sten_mk2", "lanchester", "thompson_uk"], 1: ["webley_mk6", "enfield_no2", "webley_auto"] },
    reserve: { sten_mk2: 4, lanchester: 4, thompson_uk: 4, webley_mk6: 2, enfield_no2: 2, webley_auto: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "An automatic and something that opens armour.",
    loadout: ["bren_lmg", "piat", "webley_mk6"],
    slotOptions: { 0: ["bren_lmg", "vickers_hmg"], 1: ["piat", "boys_at"], 2: ["webley_mk6", "enfield_no2", "webley_auto"] },
    reserve: { bren_lmg: 3, vickers_hmg: 3, piat: 2, boys_at: 2, webley_mk6: 2, enfield_no2: 2, webley_auto: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["enfield_scoped", "webley_mk6"],
    slotOptions: { 0: ["enfield_scoped"], 1: ["webley_mk6", "enfield_no2", "webley_auto"] },
    reserve: { enfield_scoped: 6, webley_mk6: 2, enfield_no2: 2, webley_auto: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A sidearm and a rifle. Leads from the front.",
    loadout: ["webley_mk6", "smle_no1"],
    slotOptions: { 0: ["webley_mk6", "enfield_no2", "webley_auto"], 1: ["smle_no1", "enfield_no4", "enfield_no5"] },
    reserve: { webley_mk6: 2, enfield_no2: 2, webley_auto: 2, smle_no1: 6, enfield_no4: 6, enfield_no5: 6 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Soviet                                                        */
/* ------------------------------------------------------------------ */

const USSR_WEAPONS: Record<string, WeaponSpec> = {
  tt33: { name: "TT-33", rpm: 160, speed: 320, damage: 30, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 8, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  nagant_m1895: { name: "Nagant M1895", rpm: 90, speed: 320, damage: 31, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 7, reloadTime: 3.2, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  ppsh41: { name: "PPSh-41", rpm: 900, speed: 370, damage: 24, penetration: 0, blast: 0, blastDamage: 0, spread: 0.032, magazine: 71, reloadTime: 3.6, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  pps43: { name: "PPS-43", rpm: 650, speed: 370, damage: 25, penetration: 0, blast: 0, blastDamage: 0, spread: 0.027, magazine: 35, reloadTime: 3.0, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  mosin: { name: "Mosin-Nagant", rpm: 32, speed: 510, damage: 62, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 4.0, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  mosin_carbine: { name: "Mosin Carbine M38", rpm: 48, speed: 470, damage: 57, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0068, magazine: 5, reloadTime: 3.8, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.072, recoilRecover: 4.8, swayAmount: 0.0058, adsZoom: 1.5, adsSwayMul: 0.36 },
  svt40: { name: "SVT-40", rpm: 180, speed: 495, damage: 47, penetration: 0, blast: 0, blastDamage: 0, spread: 0.007, magazine: 10, reloadTime: 3.1, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.034, recoilRecover: 6.0, swayAmount: 0.0065, adsZoom: 1.55, adsSwayMul: 0.38 },
  mosin_scoped: { name: "Scoped Mosin", rpm: 32, speed: 545, damage: 94, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0016, magazine: 5, reloadTime: 4.1, auto: false, tracer: 0xffd08a, category: "marksman", recoilKick: 0.062, recoilRecover: 3.6, swayAmount: 0.0042, adsZoom: 4.2, adsSwayMul: 0.16 },
  dp28: { name: "DP-28", rpm: 550, speed: 465, damage: 36, penetration: 2, blast: 0, blastDamage: 0, spread: 0.018, magazine: 47, reloadTime: 6.0, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  maxim_m1910: { name: "Maxim M1910", rpm: 600, speed: 490, damage: 38, penetration: 5, blast: 0, blastDamage: 0, spread: 0.016, magazine: 250, reloadTime: 9.0, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.013, recoilRecover: 5.5, swayAmount: 0.022, adsZoom: 1.15, adsSwayMul: 0.7 },
  ptrd41: { name: "PTRD-41", rpm: 11, speed: 760, damage: 100, penetration: 32, blast: 0, blastDamage: 0, spread: 0.005, magazine: 1, reloadTime: 4.8, auto: false, tracer: 0xffe0b0, category: "heavy", recoilKick: 0.16, recoilRecover: 2.4, swayAmount: 0.02, adsZoom: 2.4, adsSwayMul: 0.3 },
  f1_grenade: { name: "F-1 Grenade", rpm: 0, speed: 21, damage: 0, penetration: 0, blast: 9.5, blastDamage: 140, spread: 0, magazine: 1, reloadTime: 1.2, auto: false, tracer: 0x8a8f7a, category: "heavy" },
};

const USSR_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A service rifle and a sidearm. The baseline.",
    loadout: ["mosin", "tt33"],
    slotOptions: { 0: ["mosin", "svt40", "mosin_carbine"], 1: ["tt33", "nagant_m1895"] },
    reserve: { mosin: 6, svt40: 6, mosin_carbine: 6, tt33: 2, nagant_m1895: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "A submachine gun and a sidearm. Close range, quicker on foot.",
    loadout: ["ppsh41", "tt33"],
    slotOptions: { 0: ["ppsh41", "pps43"], 1: ["tt33", "nagant_m1895"] },
    reserve: { ppsh41: 4, pps43: 4, tt33: 2, nagant_m1895: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "An automatic and something that opens armour.",
    loadout: ["dp28", "ptrd41", "tt33"],
    slotOptions: { 0: ["dp28", "maxim_m1910"], 1: ["ptrd41"], 2: ["tt33", "nagant_m1895"] },
    reserve: { dp28: 3, maxim_m1910: 3, ptrd41: 2, tt33: 2, nagant_m1895: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["mosin_scoped", "tt33"],
    slotOptions: { 0: ["mosin_scoped"], 1: ["tt33", "nagant_m1895"] },
    reserve: { mosin_scoped: 6, tt33: 2, nagant_m1895: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A sidearm and a rifle. Leads from the front.",
    loadout: ["tt33", "mosin"],
    slotOptions: { 0: ["tt33", "nagant_m1895"], 1: ["mosin", "svt40", "mosin_carbine"] },
    reserve: { tt33: 2, nagant_m1895: 2, mosin: 6, svt40: 6, mosin_carbine: 6 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/*  German                                                        */
/* ------------------------------------------------------------------ */

const GERMANY_WEAPONS: Record<string, WeaponSpec> = {
  luger_p08: { name: "P08 Luger", rpm: 150, speed: 320, damage: 29, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 8, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  mauser_c96: { name: "Mauser C96", rpm: 130, speed: 320, damage: 33, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 10, reloadTime: 2.8, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  walther_p38: { name: "Walther P38", rpm: 155, speed: 320, damage: 31, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 8, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  mp40: { name: "MP 40", rpm: 500, speed: 370, damage: 27, penetration: 0, blast: 0, blastDamage: 0, spread: 0.024, magazine: 32, reloadTime: 3.0, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  mp38: { name: "MP 38", rpm: 500, speed: 370, damage: 27, penetration: 0, blast: 0, blastDamage: 0, spread: 0.025, magazine: 32, reloadTime: 3.1, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  mp28ii: { name: "MP 28.II", rpm: 550, speed: 370, damage: 26, penetration: 0, blast: 0, blastDamage: 0, spread: 0.027, magazine: 32, reloadTime: 3.2, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  kar98k: { name: "Kar98k", rpm: 36, speed: 510, damage: 61, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 3.6, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  kar98k_carbine: { name: "Kar98k Carbine", rpm: 48, speed: 470, damage: 57, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0068, magazine: 5, reloadTime: 3.4, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.058, recoilRecover: 4.8, swayAmount: 0.0058, adsZoom: 1.5, adsSwayMul: 0.36 },
  gewehr98_rifle: { name: "Gewehr 98", rpm: 33, speed: 510, damage: 62, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 3.8, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.7, adsSwayMul: 0.35 },
  g43: { name: "G43", rpm: 175, speed: 495, damage: 46, penetration: 0, blast: 0, blastDamage: 0, spread: 0.007, magazine: 10, reloadTime: 3.2, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.034, recoilRecover: 6.0, swayAmount: 0.0065, adsZoom: 1.55, adsSwayMul: 0.38 },
  kar98k_scoped: { name: "Kar98k (ZF39)", rpm: 32, speed: 545, damage: 92, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0016, magazine: 5, reloadTime: 3.9, auto: false, tracer: 0xffd08a, category: "marksman", recoilKick: 0.062, recoilRecover: 3.6, swayAmount: 0.0042, adsZoom: 4.2, adsSwayMul: 0.16 },
  mg34: { name: "MG 34", rpm: 850, speed: 465, damage: 35, penetration: 2, blast: 0, blastDamage: 0, spread: 0.02, magazine: 50, reloadTime: 5.6, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  mg42: { name: "MG 42", rpm: 1200, speed: 465, damage: 34, penetration: 2, blast: 0, blastDamage: 0, spread: 0.026, magazine: 50, reloadTime: 6.0, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.012, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  panzerbuchse39: { name: "Panzerbüchse 39", rpm: 11, speed: 760, damage: 94, penetration: 25, blast: 0, blastDamage: 0, spread: 0.005, magazine: 1, reloadTime: 4.4, auto: false, tracer: 0xffe0b0, category: "heavy", recoilKick: 0.16, recoilRecover: 2.4, swayAmount: 0.02, adsZoom: 2.4, adsSwayMul: 0.3 },
  panzerfaust60: { name: "Panzerfaust 60", rpm: 5, speed: 48, damage: 60, penetration: 200, blast: 6, blastDamage: 185, spread: 0.012, magazine: 1, reloadTime: 6.5, auto: false, tracer: 0x8a8f7a, category: "heavy", recoilKick: 0.12, recoilRecover: 3.0, swayAmount: 0.016, adsZoom: 1.3, adsSwayMul: 0.45 },
  stielhandgranate: { name: "Stielhandgranate 24", rpm: 0, speed: 24, damage: 0, penetration: 0, blast: 8.5, blastDamage: 125, spread: 0, magazine: 1, reloadTime: 1.2, auto: false, tracer: 0x8a8f7a, category: "heavy" },
};

const GERMANY_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A service rifle and a sidearm. The baseline.",
    loadout: ["kar98k", "luger_p08"],
    slotOptions: { 0: ["kar98k", "gewehr98_rifle", "g43", "kar98k_carbine"], 1: ["luger_p08", "walther_p38", "mauser_c96"] },
    reserve: { kar98k: 6, gewehr98_rifle: 6, g43: 6, kar98k_carbine: 6, luger_p08: 2, walther_p38: 2, mauser_c96: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "A submachine gun and a sidearm. Close range, quicker on foot.",
    loadout: ["mp40", "luger_p08"],
    slotOptions: { 0: ["mp40", "mp38", "mp28ii"], 1: ["luger_p08", "walther_p38", "mauser_c96"] },
    reserve: { mp40: 4, mp38: 4, mp28ii: 4, luger_p08: 2, walther_p38: 2, mauser_c96: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "An automatic and something that opens armour.",
    loadout: ["mg34", "panzerfaust60", "luger_p08"],
    slotOptions: { 0: ["mg34", "mg42"], 1: ["panzerfaust60", "panzerbuchse39"], 2: ["luger_p08", "walther_p38", "mauser_c96"] },
    reserve: { mg34: 3, mg42: 3, panzerfaust60: 2, panzerbuchse39: 2, luger_p08: 2, walther_p38: 2, mauser_c96: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["kar98k_scoped", "luger_p08"],
    slotOptions: { 0: ["kar98k_scoped"], 1: ["luger_p08", "walther_p38", "mauser_c96"] },
    reserve: { kar98k_scoped: 6, luger_p08: 2, walther_p38: 2, mauser_c96: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A sidearm and a rifle. Leads from the front.",
    loadout: ["luger_p08", "kar98k"],
    slotOptions: { 0: ["luger_p08", "walther_p38", "mauser_c96"], 1: ["kar98k", "gewehr98_rifle", "g43", "kar98k_carbine"] },
    reserve: { luger_p08: 2, walther_p38: 2, mauser_c96: 2, kar98k: 6, gewehr98_rifle: 6, g43: 6, kar98k_carbine: 6 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Japanese                                                        */
/* ------------------------------------------------------------------ */

const JAPAN_WEAPONS: Record<string, WeaponSpec> = {
  nambu_t14: { name: "Nambu Type 14", rpm: 145, speed: 320, damage: 26, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 8, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  nambu_t94: { name: "Nambu Type 94", rpm: 140, speed: 320, damage: 25, penetration: 0, blast: 0, blastDamage: 0, spread: 0.023, magazine: 6, reloadTime: 2.4, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  type26_revolver: { name: "Type 26 Revolver", rpm: 100, speed: 320, damage: 30, penetration: 0, blast: 0, blastDamage: 0, spread: 0.019, magazine: 6, reloadTime: 2.9, auto: false, tracer: 0xffd08a, category: "sidearm", recoilKick: 0.032, recoilRecover: 7.5, swayAmount: 0.011, adsZoom: 1.1, adsSwayMul: 0.6 },
  type100_smg: { name: "Type 100 SMG", rpm: 450, speed: 370, damage: 25, penetration: 0, blast: 0, blastDamage: 0, spread: 0.028, magazine: 30, reloadTime: 3.1, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  type2_smg: { name: "Experimental Type 2", rpm: 600, speed: 370, damage: 25, penetration: 0, blast: 0, blastDamage: 0, spread: 0.03, magazine: 30, reloadTime: 3.0, auto: true, tracer: 0xffd08a, category: "smg", recoilKick: 0.018, recoilRecover: 8.0, swayAmount: 0.009, adsZoom: 1.15, adsSwayMul: 0.5 },
  arisaka_t38: { name: "Arisaka Type 38", rpm: 38, speed: 510, damage: 54, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0055, magazine: 5, reloadTime: 3.5, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  arisaka_t99: { name: "Arisaka Type 99", rpm: 38, speed: 510, damage: 59, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 3.5, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  type44_carbine: { name: "Type 44 Carbine", rpm: 48, speed: 470, damage: 50, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0068, magazine: 5, reloadTime: 3.2, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.058, recoilRecover: 4.8, swayAmount: 0.0058, adsZoom: 1.5, adsSwayMul: 0.36 },
  type2_para: { name: "Type 2 Paratrooper", rpm: 40, speed: 510, damage: 55, penetration: 0, blast: 0, blastDamage: 0, spread: 0.006, magazine: 5, reloadTime: 3.6, auto: false, tracer: 0xffd08a, category: "rifle", recoilKick: 0.052, recoilRecover: 4.4, swayAmount: 0.0062, adsZoom: 1.6, adsSwayMul: 0.35 },
  arisaka_scoped: { name: "Scoped Type 97", rpm: 32, speed: 545, damage: 86, penetration: 0, blast: 0, blastDamage: 0, spread: 0.0016, magazine: 5, reloadTime: 3.7, auto: false, tracer: 0xffd08a, category: "marksman", recoilKick: 0.062, recoilRecover: 3.6, swayAmount: 0.0042, adsZoom: 4.0, adsSwayMul: 0.16 },
  type11_lmg: { name: "Type 11 LMG", rpm: 500, speed: 465, damage: 33, penetration: 2, blast: 0, blastDamage: 0, spread: 0.021, magazine: 30, reloadTime: 5.2, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  type96_lmg: { name: "Type 96/99 LMG", rpm: 550, speed: 465, damage: 35, penetration: 2, blast: 0, blastDamage: 0, spread: 0.018, magazine: 30, reloadTime: 5.0, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.016, recoilRecover: 7.0, swayAmount: 0.013, adsZoom: 1.2, adsSwayMul: 0.55 },
  type92_hmg: { name: "Type 92 HMG", rpm: 450, speed: 490, damage: 41, penetration: 5, blast: 0, blastDamage: 0, spread: 0.014, magazine: 30, reloadTime: 6.5, auto: true, tracer: 0xffd08a, category: "lmg", recoilKick: 0.013, recoilRecover: 5.5, swayAmount: 0.022, adsZoom: 1.15, adsSwayMul: 0.7 },
  type97_at: { name: "Type 97 AT Rifle", rpm: 11, speed: 760, damage: 92, penetration: 22, blast: 0, blastDamage: 0, spread: 0.005, magazine: 7, reloadTime: 5.2, auto: false, tracer: 0xffe0b0, category: "heavy", recoilKick: 0.16, recoilRecover: 2.4, swayAmount: 0.02, adsZoom: 2.4, adsSwayMul: 0.3 },
  type89_mortar: { name: "Type 89 Knee Mortar", rpm: 5, speed: 44, damage: 60, penetration: 12, blast: 8.5, blastDamage: 175, spread: 0.012, magazine: 1, reloadTime: 6.0, auto: false, tracer: 0x8a8f7a, category: "heavy", recoilKick: 0.12, recoilRecover: 3.0, swayAmount: 0.016, adsZoom: 1.2, adsSwayMul: 0.45 },
  type97_grenade: { name: "Type 97 Grenade", rpm: 0, speed: 21, damage: 0, penetration: 0, blast: 8, blastDamage: 118, spread: 0, magazine: 1, reloadTime: 1.2, auto: false, tracer: 0x8a8f7a, category: "heavy" },
};

const JAPAN_CLASSES: ClassDef[] = [
  {
    id: "rifleman",
    name: "Rifleman",
    description: "A service rifle and a sidearm. The baseline.",
    loadout: ["arisaka_t99", "nambu_t14"],
    slotOptions: { 0: ["arisaka_t99", "arisaka_t38", "type44_carbine", "type2_para"], 1: ["nambu_t14", "nambu_t94", "type26_revolver"] },
    reserve: { arisaka_t99: 6, arisaka_t38: 6, type44_carbine: 6, type2_para: 6, nambu_t14: 2, nambu_t94: 2, type26_revolver: 2 },
    grenades: 2,
    speedMul: 1,
    staminaMul: 1,
  },
  {
    id: "assault",
    name: "Assault",
    description: "A submachine gun and a sidearm. Close range, quicker on foot.",
    loadout: ["type100_smg", "nambu_t14"],
    slotOptions: { 0: ["type100_smg", "type2_smg"], 1: ["nambu_t14", "nambu_t94", "type26_revolver"] },
    reserve: { type100_smg: 4, type2_smg: 4, nambu_t14: 2, nambu_t94: 2, type26_revolver: 2 },
    grenades: 3,
    speedMul: 1.08,
    staminaMul: 1.05,
  },
  {
    id: "support",
    name: "Support",
    description: "An automatic and something that opens armour.",
    loadout: ["type96_lmg", "type97_at", "nambu_t14"],
    slotOptions: { 0: ["type96_lmg", "type11_lmg", "type92_hmg"], 1: ["type97_at", "type89_mortar"], 2: ["nambu_t14", "nambu_t94", "type26_revolver"] },
    reserve: { type96_lmg: 3, type11_lmg: 3, type92_hmg: 3, type97_at: 2, type89_mortar: 2, nambu_t14: 2, nambu_t94: 2, type26_revolver: 2 },
    grenades: 1,
    speedMul: 0.92,
    staminaMul: 0.9,
  },
  {
    id: "marksman",
    name: "Marksman",
    description: "A scoped rifle and a sidearm. Stays back, picks targets at range.",
    loadout: ["arisaka_scoped", "nambu_t14"],
    slotOptions: { 0: ["arisaka_scoped"], 1: ["nambu_t14", "nambu_t94", "type26_revolver"] },
    reserve: { arisaka_scoped: 6, nambu_t14: 2, nambu_t94: 2, type26_revolver: 2 },
    grenades: 1,
    speedMul: 0.96,
    staminaMul: 1,
  },
  {
    id: "officer",
    name: "Officer",
    description: "A sidearm and a rifle. Leads from the front.",
    loadout: ["nambu_t14", "arisaka_t99"],
    slotOptions: { 0: ["nambu_t14", "nambu_t94", "type26_revolver"], 1: ["arisaka_t99", "arisaka_t38", "type44_carbine", "type2_para"] },
    reserve: { nambu_t14: 2, nambu_t94: 2, type26_revolver: 2, arisaka_t99: 6, arisaka_t38: 6, type44_carbine: 6, type2_para: 6 },
    grenades: 2,
    speedMul: 1.02,
    staminaMul: 1.05,
    aiOnly: true,
  },
];

/** Every WWII nation's arsenal, keyed the same way the vehicle catalog is. */
export const WW2_ARSENALS: Record<string, NationArsenal> = {
  usa: {
    label: "American",
    grenade: "mk2_grenade",
    weapons: USA_WEAPONS,
    classes: USA_CLASSES,
    groups: {
      rifles: ["m1_garand", "m1903", "m1_carbine", "m1903_scoped"],
      smgs: ["thompson_m1a1", "m3_grease"],
      machine_guns: ["bar", "m1919"],
      anti_tank: ["bazooka"],
      sidearms: ["m1911", "m1917_revolver"],
    },
  },
  uk: {
    label: "British",
    grenade: "mills_bomb",
    weapons: UK_WEAPONS,
    classes: UK_CLASSES,
    groups: {
      rifles: ["smle_no1", "enfield_no4", "enfield_no5", "enfield_scoped"],
      smgs: ["sten_mk2", "lanchester", "thompson_uk"],
      machine_guns: ["bren_lmg", "vickers_hmg"],
      anti_tank: ["piat", "boys_at"],
      sidearms: ["webley_mk6", "enfield_no2", "webley_auto"],
    },
  },
  ussr: {
    label: "Soviet",
    grenade: "f1_grenade",
    weapons: USSR_WEAPONS,
    classes: USSR_CLASSES,
    groups: {
      rifles: ["mosin", "mosin_carbine", "svt40", "mosin_scoped"],
      smgs: ["ppsh41", "pps43"],
      machine_guns: ["dp28", "maxim_m1910"],
      anti_tank: ["ptrd41"],
      sidearms: ["tt33", "nagant_m1895"],
    },
  },
  germany: {
    label: "German",
    grenade: "stielhandgranate",
    weapons: GERMANY_WEAPONS,
    classes: GERMANY_CLASSES,
    groups: {
      rifles: ["kar98k", "kar98k_carbine", "gewehr98_rifle", "g43", "kar98k_scoped"],
      smgs: ["mp40", "mp38", "mp28ii"],
      machine_guns: ["mg34", "mg42"],
      anti_tank: ["panzerfaust60", "panzerbuchse39"],
      sidearms: ["luger_p08", "walther_p38", "mauser_c96"],
    },
  },
  japan: {
    label: "Japanese",
    grenade: "type97_grenade",
    weapons: JAPAN_WEAPONS,
    classes: JAPAN_CLASSES,
    groups: {
      rifles: ["arisaka_t38", "arisaka_t99", "type44_carbine", "type2_para", "arisaka_scoped"],
      smgs: ["type100_smg", "type2_smg"],
      machine_guns: ["type96_lmg", "type11_lmg", "type92_hmg"],
      anti_tank: ["type97_at", "type89_mortar"],
      sidearms: ["nambu_t14", "nambu_t94", "type26_revolver"],
    },
  },
};
