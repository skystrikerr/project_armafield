import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TEAM_COLOR, type Team } from "./units";

/**
 * Every model in the game is a pile of boxes, cylinders and cones baked down
 * to a single flat-shaded geometry with vertex colours. No textures, no
 * external assets: the whole battlefield ships in the bundle.
 */

type Vec3 = [number, number, number];

export type Part =
  | { g: "box"; size: Vec3; pos: Vec3; rot?: Vec3; color: number }
  | { g: "cyl"; r: number; r2?: number; h: number; seg?: number; pos: Vec3; rot?: Vec3; color: number }
  | { g: "cone"; r: number; h: number; seg?: number; pos: Vec3; rot?: Vec3; color: number }
  | { g: "sphere"; r: number; seg?: number; pos: Vec3; color: number };

const _color = new THREE.Color();

function partGeometry(part: Part): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  switch (part.g) {
    case "box":
      geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      break;
    case "cyl":
      geo = new THREE.CylinderGeometry(part.r2 ?? part.r, part.r, part.h, part.seg ?? 8);
      break;
    case "cone":
      geo = new THREE.ConeGeometry(part.r, part.h, part.seg ?? 8);
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(part.r, part.seg ?? 8, (part.seg ?? 8) / 2);
      break;
  }
  if (part.g !== "sphere" && part.rot) {
    geo.rotateX(part.rot[0]);
    geo.rotateY(part.rot[1]);
    geo.rotateZ(part.rot[2]);
  }
  geo.translate(part.pos[0], part.pos[1], part.pos[2]);

  const count = geo.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  _color.setHex(part.color).convertSRGBToLinear();
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute("uv");
  return geo;
}

/** Bake a part list into one geometry. Everything downstream is one draw call. */
export function build(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(partGeometry);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error("ironfront: failed to merge geometry");
  merged.computeVertexNormals();
  return merged;
}

export function lowPolyMaterial(opts: THREE.MeshLambertMaterialParameters = {}) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opts });
}

/* ---------------- palette ---------------- */

const STEEL = 0x4b5147;
const STEEL_DARK = 0x33372f;
const TRACK = 0x2b2b2b;
const RUBBER = 0x1f1f1f;
const GUNMETAL = 0x3a3d3f;
const WOOD = 0x6b4f2e;
const WOOD_DARK = 0x4c3720;
const SKIN = 0xc39a72;
const CLOTH = 0x6a6f4e;
const CLOTH_DARK = 0x4a4f36;
const BOOT = 0x2f2a24;
const CANVAS = 0x8b7c58;

/* ---------------- tank ---------------- */

/**
 * A boxy mid-war medium. The hull carries the tracks and running gear; the
 * turret and barrel are separate geometries so they can traverse and elevate.
 */
export function tankHullGeometry(team: Team): THREE.BufferGeometry {
  const tint = TEAM_COLOR[team];
  const parts: Part[] = [
    // Lower hull.
    { g: "box", size: [3.1, 0.9, 6.2], pos: [0, 0.55, 0], color: tint.primary },
    // Glacis: a sloped plate, which is also what the armour model assumes.
    { g: "box", size: [3.1, 0.28, 2.3], pos: [0, 1.16, 2.05], rot: [-0.62, 0, 0], color: tint.light },
    // Upper hull deck.
    { g: "box", size: [3.0, 0.5, 3.4], pos: [0, 1.2, -0.6], color: tint.primary },
    // Rear engine deck with louvres.
    { g: "box", size: [2.6, 0.16, 1.5], pos: [0, 1.5, -2.2], color: STEEL_DARK },
    { g: "box", size: [2.2, 0.1, 0.14], pos: [0, 1.6, -1.9], color: GUNMETAL },
    { g: "box", size: [2.2, 0.1, 0.14], pos: [0, 1.6, -2.2], color: GUNMETAL },
    { g: "box", size: [2.2, 0.1, 0.14], pos: [0, 1.6, -2.5], color: GUNMETAL },
    // Fenders.
    { g: "box", size: [3.9, 0.1, 5.4], pos: [0, 1.02, -0.1], color: tint.dark },
    // Bow machine gun.
    { g: "cyl", r: 0.08, h: 0.9, seg: 6, pos: [0.85, 1.1, 2.7], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    // Tool boxes and a spare track link, the details that sell the scale.
    { g: "box", size: [0.5, 0.35, 1.2], pos: [1.6, 1.3, -1.4], color: CANVAS },
    { g: "box", size: [0.5, 0.35, 1.2], pos: [-1.6, 1.3, -1.4], color: CANVAS },
    { g: "box", size: [1.1, 0.12, 0.5], pos: [0, 1.42, 1.5], color: TRACK },
    // Headlights.
    { g: "cyl", r: 0.16, h: 0.14, seg: 8, pos: [1.1, 1.5, 2.55], rot: [Math.PI / 2, 0, 0], color: 0xd8d2b0 },
    { g: "cyl", r: 0.16, h: 0.14, seg: 8, pos: [-1.1, 1.5, 2.55], rot: [Math.PI / 2, 0, 0], color: 0xd8d2b0 },
  ];

  // Tracks and running gear.
  for (const side of [-1, 1]) {
    const x = side * 1.72;
    parts.push({ g: "box", size: [0.62, 1.0, 6.5], pos: [x, 0.62, 0], color: TRACK });
    parts.push({ g: "box", size: [0.66, 0.5, 5.6], pos: [x, 1.15, 0], color: STEEL_DARK });
    for (let i = 0; i < 5; i++) {
      const z = -2.2 + i * 1.1;
      parts.push({
        g: "cyl",
        r: 0.44,
        h: 0.42,
        seg: 10,
        pos: [x, 0.62, z],
        rot: [0, 0, Math.PI / 2],
        color: RUBBER,
      });
    }
    // Drive sprocket and idler.
    parts.push({ g: "cyl", r: 0.5, h: 0.4, seg: 8, pos: [x, 0.78, -2.95], rot: [0, 0, Math.PI / 2], color: STEEL });
    parts.push({ g: "cyl", r: 0.5, h: 0.4, seg: 8, pos: [x, 0.78, 2.95], rot: [0, 0, Math.PI / 2], color: STEEL });
    // Team stripe, so you can tell friend from foe at 300 m.
    parts.push({ g: "box", size: [0.08, 0.3, 1.0], pos: [side * 2.06, 1.3, 0.6], color: tint.light });
  }
  return build(parts);
}

/** Turret geometry, with its origin on the ring so it can spin in place. */
export function tankTurretGeometry(team: Team): THREE.BufferGeometry {
  const tint = TEAM_COLOR[team];
  const parts: Part[] = [
    { g: "box", size: [2.3, 0.95, 2.9], pos: [0, 0.48, 0], color: tint.primary },
    // Sloped turret cheeks.
    { g: "box", size: [1.7, 0.8, 0.7], pos: [0, 0.5, 1.5], rot: [0.45, 0, 0], color: tint.light },
    { g: "box", size: [2.0, 0.35, 1.0], pos: [0, 0.9, -1.2], rot: [-0.35, 0, 0], color: tint.dark },
    // Mantlet.
    { g: "cyl", r: 0.45, h: 0.6, seg: 10, pos: [0, 0.5, 1.6], rot: [Math.PI / 2, 0, 0], color: STEEL },
    // Commander's cupola with a vision block.
    { g: "cyl", r: 0.42, h: 0.34, seg: 10, pos: [-0.45, 1.12, -0.5], color: tint.dark },
    { g: "box", size: [0.2, 0.14, 0.1], pos: [-0.45, 1.16, -0.12], color: 0x1a1a1a },
    // Roof-mounted machine gun.
    { g: "cyl", r: 0.06, h: 0.85, seg: 6, pos: [-0.45, 1.42, -0.1], rot: [Math.PI / 2 - 0.1, 0, 0], color: GUNMETAL },
    { g: "box", size: [0.14, 0.16, 0.3], pos: [-0.45, 1.36, -0.5], color: GUNMETAL },
    // Stowage bin on the bustle.
    { g: "box", size: [1.7, 0.45, 0.5], pos: [0, 0.7, -1.65], color: CANVAS },
    // Aerial.
    { g: "cyl", r: 0.03, h: 1.6, seg: 4, pos: [0.85, 1.7, -1.1], rot: [0.12, 0, 0.1], color: 0x22221e },
  ];
  return build(parts);
}

/** Barrel, origin at the trunnion, pointing down +Z. */
export function tankBarrelGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.15, h: 3.6, seg: 10, pos: [0, 0, 1.8], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "cyl", r: 0.2, h: 0.5, seg: 10, pos: [0, 0, 0.4], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    // Muzzle brake.
    { g: "cyl", r: 0.23, h: 0.45, seg: 10, pos: [0, 0, 3.5], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
  ]);
}

/* ---------------- soldier ---------------- */

export function rifleGeometry(): THREE.BufferGeometry {
  return build([
    { g: "box", size: [0.07, 0.09, 0.95], pos: [0, 0, 0.25], color: WOOD },
    { g: "box", size: [0.06, 0.16, 0.3], pos: [0, -0.08, -0.22], rot: [0.25, 0, 0], color: WOOD_DARK },
    { g: "cyl", r: 0.022, h: 0.75, seg: 6, pos: [0, 0.03, 0.85], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "box", size: [0.05, 0.18, 0.12], pos: [0, -0.12, 0.05], color: GUNMETAL },
    { g: "box", size: [0.04, 0.06, 0.06], pos: [0, 0.09, 1.16], color: GUNMETAL },
  ]);
}

export function launcherGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.09, h: 1.5, seg: 8, pos: [0, 0, 0.4], rot: [Math.PI / 2, 0, 0], color: 0x4d5240 },
    { g: "cone", r: 0.13, h: 0.34, seg: 8, pos: [0, 0, 1.28], rot: [Math.PI / 2, 0, 0], color: 0x6b3a2a },
    { g: "cyl", r: 0.14, h: 0.25, seg: 8, pos: [0, 0, -0.4], rot: [Math.PI / 2, 0, 0], color: 0x33372f },
    { g: "box", size: [0.05, 0.16, 0.1], pos: [0, -0.14, 0.1], color: 0x22241c },
  ]);
}

/* ---------------- aircraft ---------------- */

export function propellerGeometry(): THREE.BufferGeometry {
  return build([
    { g: "box", size: [0.16, 3.4, 0.06], pos: [0, 0, 0], color: 0x2a2c26 },
    { g: "box", size: [3.4, 0.16, 0.06], pos: [0, 0, 0], color: 0x2a2c26 },
    { g: "cyl", r: 0.16, h: 0.2, seg: 6, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
  ]);
}

/* ---------------- scenery ---------------- */

export function treeGeometry(kind: string): THREE.BufferGeometry {
  if (kind === "pine") {
    return build([
      { g: "cyl", r: 0.24, r2: 0.16, h: 3.0, seg: 6, pos: [0, 1.5, 0], color: 0x4a3626 },
      { g: "cone", r: 1.7, h: 3.0, seg: 7, pos: [0, 3.4, 0], color: 0x2f4a2a },
      { g: "cone", r: 1.3, h: 2.6, seg: 7, pos: [0, 4.9, 0], color: 0x37552f },
      { g: "cone", r: 0.85, h: 2.0, seg: 7, pos: [0, 6.2, 0], color: 0x3d5f34 },
    ]);
  }
  if (kind === "birch") {
    return build([
      { g: "cyl", r: 0.17, r2: 0.12, h: 4.6, seg: 6, pos: [0, 2.3, 0], color: 0xd8d5c4 },
      { g: "box", size: [0.36, 0.08, 0.36], pos: [0, 2.0, 0], color: 0x3a3a34 },
      { g: "sphere", r: 1.6, seg: 6, pos: [0, 5.2, 0], color: 0x6f8f42 },
      { g: "sphere", r: 1.1, seg: 6, pos: [0.9, 4.6, 0.5], color: 0x627f3a },
    ]);
  }
  if (kind === "palm") {
    // Bare leaning trunk with a crown of fronds — reads as "hot" instantly.
    const parts: Part[] = [
      { g: "cyl", r: 0.24, r2: 0.16, h: 6.4, seg: 6, pos: [0.5, 3.2, 0], rot: [0, 0, -0.16], color: 0x7a6144 },
    ];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.push({
        g: "box",
        size: [0.5, 0.1, 3.2],
        pos: [1.0 + Math.sin(a) * 1.3, 6.3 - Math.abs(Math.cos(a)) * 0.4, Math.cos(a) * 1.3],
        rot: [0.32, a, 0],
        color: i % 2 === 0 ? 0x4f7038 : 0x5c7d3e,
      });
    }
    parts.push({ g: "sphere", r: 0.45, seg: 6, pos: [1.0, 6.5, 0], color: 0x6b5a3a });
    return build(parts);
  }
  if (kind === "dead") {
    // Bare limbs, no canopy. Winter, desert and shelled ground all use it.
    const parts: Part[] = [
      { g: "cyl", r: 0.3, r2: 0.14, h: 4.4, seg: 6, pos: [0, 2.2, 0], color: 0x584f42 },
    ];
    for (const [x, y, z, rx, rz] of [
      [0.8, 3.6, 0.2, 0.2, -0.9], [-0.7, 4.0, -0.3, -0.3, 0.8], [0.2, 4.6, 0.8, 0.9, -0.2],
    ] as const) {
      parts.push({ g: "cyl", r: 0.11, r2: 0.05, h: 2.2, seg: 5, pos: [x, y, z], rot: [rx, 0, rz], color: 0x4f4739 });
    }
    return build(parts);
  }
  return build([
    { g: "cyl", r: 0.36, r2: 0.24, h: 3.2, seg: 6, pos: [0, 1.6, 0], color: 0x584028 },
    { g: "sphere", r: 2.1, seg: 7, pos: [0, 4.4, 0], color: 0x4f6f34 },
    { g: "sphere", r: 1.5, seg: 6, pos: [1.5, 3.9, 0.4], color: 0x466330 },
    { g: "sphere", r: 1.35, seg: 6, pos: [-1.3, 4.1, -0.6], color: 0x577a3a },
  ]);
}

/** A bridge deck: planked roadway on piers, with a kerb down each edge. */
export function bridgeGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { g: "box", size: [46, 0.9, 14], pos: [0, 0, 0], color: 0x6f6a5c },
    { g: "box", size: [46, 0.5, 1.1], pos: [0, 0.7, 6.6], color: 0x8a8375 },
    { g: "box", size: [46, 0.5, 1.1], pos: [0, 0.7, -6.6], color: 0x8a8375 },
  ];
  // Plank courses across the deck, and piers down into the water.
  for (let i = 0; i < 11; i++) {
    parts.push({ g: "box", size: [1.1, 0.16, 13.4], pos: [-20 + i * 4, 0.5, 0], color: 0x5f5a4e });
  }
  for (const x of [-16, 0, 16]) {
    for (const z of [-5, 5]) {
      parts.push({ g: "box", size: [2.2, 9, 2.2], pos: [x, -5, z], color: 0x6b665a });
    }
  }
  return build(parts);
}

export function rockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  geo.scale(1, 0.72, 0.88);
  const count = geo.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = 0.82 + ((i * 37) % 11) / 40;
    _color.setHex(0x7a766c).convertSRGBToLinear().multiplyScalar(shade);
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  return geo;
}

export function bushGeometry(): THREE.BufferGeometry {
  return build([
    { g: "sphere", r: 0.85, seg: 6, pos: [0, 0.6, 0], color: 0x415c2c },
    { g: "sphere", r: 0.6, seg: 6, pos: [0.6, 0.45, 0.3], color: 0x4c6a33 },
    { g: "sphere", r: 0.55, seg: 6, pos: [-0.5, 0.4, -0.35], color: 0x395226 },
  ]);
}

export function stumpGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.4, r2: 0.34, h: 0.9, seg: 7, pos: [0, 0.45, 0], color: 0x554027 },
    { g: "cyl", r: 0.35, h: 0.08, seg: 7, pos: [0, 0.92, 0], color: 0x7d6440 },
  ]);
}

export function crateGeometry(): THREE.BufferGeometry {
  return build([
    { g: "box", size: [1.1, 0.9, 1.1], pos: [0, 0.45, 0], color: 0x7a5f38 },
    { g: "box", size: [1.16, 0.1, 1.16], pos: [0, 0.72, 0], color: 0x5d4728 },
    { g: "box", size: [1.16, 0.1, 1.16], pos: [0, 0.2, 0], color: 0x5d4728 },
  ]);
}

export function sandbagGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let row = 0; row < 3; row++) {
    const y = 0.18 + row * 0.34;
    const n = 8 - row;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.78;
      parts.push({
        g: "box",
        size: [0.76, 0.32, 0.6],
        pos: [x, y, ((row + i) % 2) * 0.08 - 0.04],
        rot: [0, ((i * 37) % 10) / 60 - 0.08, 0],
        color: row % 2 === 0 ? 0x9a8c62 : 0x8a7d55,
      });
    }
  }
  return build(parts);
}

/** A ruined-looking village house. Dimensions are baked per building. */
export function houseGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const wall = 0xc4b393;
  const trim = 0x8f7d5e;
  const roof = 0x8a4a37;
  const parts: Part[] = [
    { g: "box", size: [w, h, d], pos: [0, h / 2, 0], color: wall },
    { g: "box", size: [w + 0.3, 0.28, d + 0.3], pos: [0, h + 0.1, 0], color: trim },
    // Hipped roof from two rotated slabs.
    { g: "box", size: [w * 0.78, 0.26, d + 0.7], pos: [w * 0.24, h + 0.75, 0], rot: [0, 0, -0.72], color: roof },
    { g: "box", size: [w * 0.78, 0.26, d + 0.7], pos: [-w * 0.24, h + 0.75, 0], rot: [0, 0, 0.72], color: roof },
    { g: "box", size: [0.5, 1.2, 0.5], pos: [w * 0.25, h + 1.4, d * 0.2], color: 0x7d6a55 },
    // Door and windows on the long faces.
    { g: "box", size: [0.9, 1.9, 0.12], pos: [0, 0.95, d / 2 + 0.02], color: 0x4a3520 },
  ];
  const rows = h > 6 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const y = 1.6 + r * 2.6;
    for (const sx of [-1, 1]) {
      parts.push({ g: "box", size: [0.8, 0.9, 0.12], pos: [sx * w * 0.3, y, d / 2 + 0.02], color: 0x2e3538 });
      parts.push({ g: "box", size: [0.8, 0.9, 0.12], pos: [sx * w * 0.3, y, -d / 2 - 0.02], color: 0x2e3538 });
      parts.push({ g: "box", size: [0.12, 0.9, 0.8], pos: [w / 2 + 0.02, y, sx * d * 0.28], color: 0x2e3538 });
      parts.push({ g: "box", size: [0.12, 0.9, 0.8], pos: [-w / 2 - 0.02, y, sx * d * 0.28], color: 0x2e3538 });
    }
  }
  return build(parts);
}

/** Capture-point flagpole. The banner is a separate mesh so it can be recoloured. */
export function flagpoleGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.9, h: 0.4, seg: 10, pos: [0, 0.2, 0], color: 0x6f6a5f },
    { g: "cyl", r: 0.12, h: 8.5, seg: 6, pos: [0, 4.4, 0], color: 0xb0aa9a },
  ]);
}

export function bannerGeometry(): THREE.BufferGeometry {
  return build([{ g: "box", size: [2.6, 1.5, 0.08], pos: [1.4, 0, 0], color: 0xffffff }]);
}

/* ---------------- projectiles & effects ---------------- */

export function shellGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.09, h: 0.36, seg: 6, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: 0x8a7a4a },
    { g: "cone", r: 0.09, h: 0.22, seg: 6, pos: [0, 0, 0.28], rot: [Math.PI / 2, 0, 0], color: 0x6f6350 },
  ]);
}

export function rocketGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.07, h: 0.5, seg: 6, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: 0x4d5240 },
    { g: "cone", r: 0.11, h: 0.28, seg: 6, pos: [0, 0, 0.36], rot: [Math.PI / 2, 0, 0], color: 0x6b3a2a },
    { g: "box", size: [0.02, 0.24, 0.2], pos: [0, 0, -0.24], color: 0x33372f },
    { g: "box", size: [0.24, 0.02, 0.2], pos: [0, 0, -0.24], color: 0x33372f },
  ]);
}

export function grenadeGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.09, h: 0.22, seg: 6, pos: [0, 0, 0], color: 0x4a5138 },
    { g: "cyl", r: 0.03, h: 0.1, seg: 5, pos: [0, 0.15, 0], color: 0x6f6a5f },
  ]);
}

export function bombGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.22, h: 1.2, seg: 8, pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0], color: 0x50564a },
    { g: "cone", r: 0.22, h: 0.4, seg: 8, pos: [0, 0, 0.75], rot: [Math.PI / 2, 0, 0], color: 0x3d4238 },
    { g: "box", size: [0.5, 0.03, 0.35], pos: [0, 0, -0.6], color: 0x3d4238 },
    { g: "box", size: [0.03, 0.5, 0.35], pos: [0, 0, -0.6], color: 0x3d4238 },
  ]);
}

/** Burnt-out hull left behind when a tank brews up. */
export function wreckGeometry(): THREE.BufferGeometry {
  return build([
    { g: "box", size: [3.1, 0.9, 6.2], pos: [0, 0.55, 0], color: 0x2b2722 },
    { g: "box", size: [3.0, 0.5, 3.4], pos: [0, 1.2, -0.6], color: 0x241f1b },
    { g: "box", size: [0.62, 1.0, 6.5], pos: [1.72, 0.62, 0], color: 0x1d1a17 },
    { g: "box", size: [0.62, 1.0, 6.5], pos: [-1.72, 0.62, 0], color: 0x1d1a17 },
    { g: "box", size: [2.2, 0.8, 2.6], pos: [0.3, 1.75, -0.2], rot: [0.2, 0.5, 0.15], color: 0x322c26 },
  ]);
}
