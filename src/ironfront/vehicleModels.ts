import * as THREE from "three";
import { build, type Part } from "./models";
import { mainGunOf, type Chassis, type VehicleDef } from "./matchConfig";

/**
 * Low-poly meshes for every chassis in the vehicle catalog, built from the
 * same box/cylinder baker the rest of the game uses — no external assets.
 *
 * A vehicle's body colour comes from its `tint` in matchConfig, so a Sherman
 * is olive drab and a Panzer IV is dark grey without needing separate
 * geometry per nation. Anything shared across chassis (wheels, tracks, glass)
 * uses the fixed palette below.
 */

const TRACK = 0x2b2b2b;
const RUBBER = 0x1f1f1f;
const GUNMETAL = 0x3a3d3f;
const STEEL = 0x4b5147;
const STEEL_DARK = 0x33372f;
const GLASS = 0x6d8391;
const CANVAS = 0x8b7c58;
const WOOD = 0x6b4f2e;
const WOOD_DARK = 0x4c3720;
const LAMP = 0xd8d2b0;

/** Nudge a hex colour's brightness, for panel shading off the base tint. */
function shade(hex: number, mul: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * mul));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * mul));
  const b = Math.min(255, Math.round((hex & 0xff) * mul));
  return (r << 16) | (g << 8) | b;
}

/** Four road wheels at the corners of a wheelbase. */
function wheels(parts: Part[], halfTrackWidth: number, radius: number, positions: number[]) {
  for (const side of [-1, 1]) {
    for (const z of positions) {
      parts.push({
        g: "cyl",
        r: radius,
        h: radius * 0.55,
        seg: 10,
        pos: [side * halfTrackWidth, radius, z],
        rot: [0, 0, Math.PI / 2],
        color: RUBBER,
      });
      // Hub, so the wheel reads as a wheel rather than a black disc.
      parts.push({
        g: "cyl",
        r: radius * 0.42,
        h: radius * 0.6,
        seg: 8,
        pos: [side * halfTrackWidth, radius, z],
        rot: [0, 0, Math.PI / 2],
        color: STEEL,
      });
    }
  }
}

/** Headlight pair on the nose. */
function headlights(parts: Part[], x: number, y: number, z: number) {
  for (const side of [-1, 1]) {
    parts.push({ g: "cyl", r: 0.13, h: 0.1, seg: 8, pos: [side * x, y, z], rot: [Math.PI / 2, 0, 0], color: LAMP });
  }
}

/**
 * One side of a tracked running gear.
 *
 * The obvious way to draw a track — a single tall box down the side — swallows
 * the road wheels whole and leaves a featureless black wall, so instead the
 * belt is drawn as its two visible runs (top and bottom) with the wheels
 * exposed in the gap between them. The runs are a touch wider than the wheels
 * so the belt still reads as the outermost surface.
 */
function trackBelt(
  parts: Part[],
  x: number,
  opts: {
    width: number;
    length: number;
    /** Centre height of the wheels; the belt wraps above and below them. */
    wheelY: number;
    wheelR: number;
    wheelCount: number;
    /** Sprocket/idler radius at the two ends of the run. */
    endR: number;
    endZ: number;
  },
) {
  const { width, length, wheelY, wheelR, wheelCount, endR, endZ } = opts;
  const runT = wheelR * 0.34;
  // Bottom run rides on the ground, top run sits over the wheels.
  parts.push({ g: "box", size: [width, runT, length], pos: [x, wheelY - wheelR, 0], color: TRACK });
  parts.push({ g: "box", size: [width, runT, length * 0.94], pos: [x, wheelY + wheelR + runT * 0.2, 0], color: TRACK });
  // Road wheels, narrower than the belt so they sit inboard of it.
  const span = length - endR * 2.2;
  for (let i = 0; i < wheelCount; i++) {
    const t = wheelCount === 1 ? 0.5 : i / (wheelCount - 1);
    parts.push({
      g: "cyl", r: wheelR, h: width * 0.62, seg: 10,
      pos: [x, wheelY, -span / 2 + t * span], rot: [0, 0, Math.PI / 2], color: RUBBER,
    });
    parts.push({
      g: "cyl", r: wheelR * 0.42, h: width * 0.68, seg: 8,
      pos: [x, wheelY, -span / 2 + t * span], rot: [0, 0, Math.PI / 2], color: STEEL,
    });
  }
  // Drive sprocket and idler, raised slightly as they are on the real thing.
  for (const z of [endZ, -endZ]) {
    parts.push({ g: "cyl", r: endR, h: width * 0.7, seg: 8, pos: [x, wheelY + endR * 0.35, z], rot: [0, 0, Math.PI / 2], color: STEEL });
    parts.push({ g: "cyl", r: endR * 0.3, h: width * 0.76, seg: 6, pos: [x, wheelY + endR * 0.35, z], rot: [0, 0, Math.PI / 2], color: STEEL_DARK });
  }
}

/* ================================================================== */
/*  Light car — Willys Jeep / Kübelwagen                                */
/* ================================================================== */

function lightCarGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const parts: Part[] = [
    // Hull tub.
    { g: "box", size: [1.8, 0.55, 3.6], pos: [0, 0.72, 0], color: body },
    // Bonnet, slightly lower than the crew tub.
    { g: "box", size: [1.65, 0.42, 1.2], pos: [0, 0.86, 1.4], color: body },
    // Radiator grille.
    { g: "box", size: [1.5, 0.5, 0.12], pos: [0, 0.88, 2.02], color: dark },
    for_grille(),
    // Windscreen frame, folded up.
    { g: "box", size: [1.6, 0.62, 0.08], pos: [0, 1.32, 0.72], rot: [-0.22, 0, 0], color: dark },
    { g: "box", size: [1.44, 0.5, 0.04], pos: [0, 1.33, 0.69], rot: [-0.22, 0, 0], color: GLASS },
    // Seats.
    { g: "box", size: [0.6, 0.34, 0.5], pos: [-0.42, 1.14, 0.1], color: dark },
    { g: "box", size: [0.6, 0.34, 0.5], pos: [0.42, 1.14, 0.1], color: dark },
    { g: "box", size: [1.5, 0.3, 0.45], pos: [0, 1.12, -0.85], color: dark },
    // Spare wheel on the tail.
    { g: "cyl", r: 0.36, h: 0.2, seg: 10, pos: [0, 1.0, -1.92], rot: [Math.PI / 2, 0, 0], color: RUBBER },
    // Fenders.
    { g: "box", size: [2.2, 0.1, 3.2], pos: [0, 0.98, 0.2], color: dark },
  ];
  headlights(parts, 0.55, 1.0, 2.06);
  wheels(parts, 0.92, 0.42, [1.25, -1.15]);
  return build(parts);
}

/** Grille slats — pulled out so the part list above stays readable. */
function for_grille(): Part {
  return { g: "box", size: [1.2, 0.06, 0.16], pos: [0, 0.88, 2.06], color: 0x22241e };
}

/* ================================================================== */
/*  Motorcycle with sidecar                                             */
/* ================================================================== */

function motorcycleGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.7);
  const parts: Part[] = [
    // Bike frame and tank.
    { g: "box", size: [0.34, 0.34, 1.5], pos: [0, 0.72, 0], color: body },
    { g: "box", size: [0.3, 0.26, 0.7], pos: [0, 0.98, 0.15], color: dark },
    // Saddle.
    { g: "box", size: [0.3, 0.14, 0.5], pos: [0, 1.14, -0.3], color: 0x2a241c },
    // Handlebars.
    { g: "cyl", r: 0.04, h: 0.8, seg: 6, pos: [0, 1.16, 0.72], rot: [0, 0, Math.PI / 2], color: GUNMETAL },
    { g: "cyl", r: 0.05, h: 0.5, seg: 6, pos: [0, 0.98, 0.68], rot: [0.3, 0, 0], color: GUNMETAL },
    // Exhaust.
    { g: "cyl", r: 0.06, h: 1.1, seg: 6, pos: [0.22, 0.5, -0.2], rot: [Math.PI / 2, 0, 0], color: STEEL },
    // Sidecar tub on the right, with its own wheel.
    { g: "box", size: [0.72, 0.5, 1.5], pos: [0.95, 0.68, -0.1], color: body },
    { g: "box", size: [0.6, 0.16, 0.5], pos: [0.95, 0.95, -0.45], color: 0x2a241c },
    // Sidecar nose, tapered.
    { g: "cone", r: 0.36, h: 0.6, seg: 8, pos: [0.95, 0.72, 0.85], rot: [Math.PI / 2, 0, 0], color: body },
    { g: "box", size: [1.0, 0.08, 1.6], pos: [0.5, 0.92, -0.1], color: dark },
  ];
  headlights(parts, 0.0, 1.02, 0.82);
  // Bike wheels (front/rear) plus the sidecar wheel.
  for (const [x, z] of [[0, 0.95], [0, -0.95], [0.95, -0.55]] as [number, number][]) {
    parts.push({ g: "cyl", r: 0.4, h: 0.16, seg: 12, pos: [x, 0.4, z], rot: [0, 0, Math.PI / 2], color: RUBBER });
    parts.push({ g: "cyl", r: 0.16, h: 0.18, seg: 8, pos: [x, 0.4, z], rot: [0, 0, Math.PI / 2], color: STEEL });
  }
  return build(parts);
}

/* ================================================================== */
/*  Truck — GMC CCKW / Opel Blitz                                       */
/* ================================================================== */

function truckGeometry(tint: number, canvasTop: boolean): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const parts: Part[] = [
    // Chassis rail.
    { g: "box", size: [2.0, 0.3, 6.4], pos: [0, 0.72, 0], color: dark },
    // Engine bay and cab.
    { g: "box", size: [2.0, 0.85, 1.6], pos: [0, 1.15, 2.15], color: body },
    { g: "box", size: [2.1, 1.15, 1.5], pos: [0, 1.62, 0.85], color: body },
    // Cab glass.
    { g: "box", size: [1.85, 0.6, 0.1], pos: [0, 1.85, 1.58], rot: [-0.12, 0, 0], color: GLASS },
    { g: "box", size: [0.1, 0.55, 1.2], pos: [1.06, 1.8, 0.85], color: GLASS },
    { g: "box", size: [0.1, 0.55, 1.2], pos: [-1.06, 1.8, 0.85], color: GLASS },
    // Radiator.
    { g: "box", size: [1.7, 0.7, 0.14], pos: [0, 1.15, 2.96], color: dark },
    // Cargo bed.
    { g: "box", size: [2.3, 0.12, 3.4], pos: [0, 1.3, -1.5], color: dark },
    { g: "box", size: [0.12, 0.6, 3.4], pos: [1.15, 1.6, -1.5], color: body },
    { g: "box", size: [0.12, 0.6, 3.4], pos: [-1.15, 1.6, -1.5], color: body },
    { g: "box", size: [2.3, 0.6, 0.12], pos: [0, 1.6, -3.15], color: body },
    // Fenders.
    { g: "box", size: [2.5, 0.1, 2.0], pos: [0, 1.02, 2.0], color: dark },
  ];
  if (canvasTop) {
    // Tilt hoops and canvas — the Opel Blitz silhouette.
    parts.push({ g: "box", size: [2.34, 1.3, 3.5], pos: [0, 2.2, -1.5], color: CANVAS });
    parts.push({ g: "box", size: [2.38, 0.1, 3.4], pos: [0, 2.84, -1.5], color: shade(CANVAS, 0.85) });
  }
  headlights(parts, 0.72, 1.5, 2.98);
  // 6x6: one front axle, two close-coupled rear axles.
  wheels(parts, 1.06, 0.55, [2.0, -1.25, -2.35]);
  return build(parts);
}

/* ================================================================== */
/*  Amphibious truck — DUKW                                             */
/* ================================================================== */

function amphibiousGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const parts: Part[] = [
    // Boat hull: a long tub with a tapered bow.
    { g: "box", size: [2.4, 1.1, 7.0], pos: [0, 0.95, 0], color: body },
    { g: "cone", r: 1.2, h: 1.6, seg: 6, pos: [0, 0.95, 4.1], rot: [Math.PI / 2, 0, 0], color: body },
    // Gunwale rail.
    { g: "box", size: [2.55, 0.12, 7.0], pos: [0, 1.52, 0], color: dark },
    // Open crew well with a windscreen.
    { g: "box", size: [1.9, 0.5, 1.6], pos: [0, 1.72, 1.5], color: dark },
    { g: "box", size: [1.7, 0.5, 0.08], pos: [0, 1.98, 2.28], rot: [-0.18, 0, 0], color: GLASS },
    // Cargo well.
    { g: "box", size: [2.0, 0.1, 3.0], pos: [0, 1.55, -1.4], color: dark },
    // Stern propeller and rudder, the giveaway that it swims.
    { g: "cyl", r: 0.3, h: 0.1, seg: 8, pos: [0, 0.55, -3.7], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "box", size: [0.1, 0.6, 0.5], pos: [0, 0.6, -3.95], color: STEEL_DARK },
  ];
  headlights(parts, 0.8, 1.35, 3.6);
  wheels(parts, 1.16, 0.52, [2.2, -1.1, -2.2]);
  return build(parts);
}

/* ================================================================== */
/*  Half-track — SdKfz 251                                              */
/* ================================================================== */

/**
 * `tapered` builds the SdKfz 251, whose flanks converge to a narrow rear door.
 * The Allied M3 is the same class of vehicle built the plain way: a square
 * armoured nose, vertical sides, and a machine-gun ring over the cab.
 */
function halftrackGeometry(tint: number, tapered: boolean): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.25);
  const parts: Part[] = [
    // Sloped armoured nose.
    { g: "box", size: [2.2, 0.8, 1.8], pos: [0, 1.0, 2.3], color: body },
    { g: "box", size: [2.2, 0.28, 1.0], pos: [0, 1.42, 2.9], rot: [-0.7, 0, 0], color: light },
    // Crew compartment.
    { g: "box", size: tapered ? [1.9, 0.9, 3.4] : [2.3, 0.9, 3.6], pos: [0, 1.25, -0.5], color: body },
    // Open top: a rim rather than a roof.
    { g: "box", size: [2.4, 0.1, 3.5], pos: [0, 1.74, -0.5], color: dark },
    // Vision slit.
    { g: "box", size: [1.4, 0.14, 0.1], pos: [0, 1.42, 1.42], color: 0x1a1a1a },
    // Pintle MG at the front of the troop bay.
    { g: "box", size: [0.4, 0.28, 0.4], pos: [0, 1.85, 1.1], color: GUNMETAL },
    { g: "cyl", r: 0.06, h: 1.0, seg: 6, pos: [0, 1.98, 1.6], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    // Rear doors, narrow because the flanks have converged by this point.
    { g: "box", size: [1.3, 0.85, 0.14], pos: [0, 1.25, -2.45], color: dark },
  ];
  if (tapered) {
    // The 251's signature: flanks canted well outboard, converging to a narrow
    // rear door.
    parts.push(
      { g: "box", size: [0.22, 1.0, 3.4], pos: [1.12, 1.28, -0.5], rot: [0, 0, 0.34], color: light },
      { g: "box", size: [0.22, 1.0, 3.4], pos: [-1.12, 1.28, -0.5], rot: [0, 0, -0.34], color: light },
      { g: "box", size: [0.22, 0.95, 1.1], pos: [0.78, 1.26, -2.0], rot: [0, 0.5, 0.34], color: light },
      { g: "box", size: [0.22, 0.95, 1.1], pos: [-0.78, 1.26, -2.0], rot: [0, -0.5, -0.34], color: light },
    );
  } else {
    // The M3: vertical sides, a square nose, and a ring mount over the cab.
    parts.push(
      { g: "box", size: [0.16, 1.0, 3.6], pos: [1.2, 1.28, -0.5], color: light },
      { g: "box", size: [0.16, 1.0, 3.6], pos: [-1.2, 1.28, -0.5], color: light },
      { g: "cyl", r: 0.62, r2: 0.62, h: 0.12, seg: 12, pos: [0, 1.86, 1.0], color: STEEL_DARK },
      { g: "cyl", r: 0.2, h: 0.34, seg: 8, pos: [0, 2.0, 1.0], color: GUNMETAL },
      // Unditching roller on the nose — the M3's other giveaway.
      { g: "cyl", r: 0.38, h: 1.6, seg: 10, pos: [0, 0.72, 3.35], rot: [0, 0, Math.PI / 2], color: STEEL_DARK },
    );
  }
  headlights(parts, 0.9, 1.5, 3.15);
  // Front steering wheels...
  wheels(parts, 1.05, 0.44, [2.5]);
  // ...and rear tracks, which is what makes it a half-track. They sit proud of
  // the hull sides so the running gear is visible from straight ahead.
  for (const side of [-1, 1]) {
    const belt: Part[] = [];
    trackBelt(belt, 0, { width: 0.5, length: 3.5, wheelY: 0.46, wheelR: 0.34, wheelCount: 4, endR: 0.4, endZ: 1.5 });
    for (const part of belt) {
      part.pos = [side * 1.28, part.pos[1], part.pos[2] - 0.9];
      parts.push(part);
    }
  }
  return build(parts);
}

/* ================================================================== */
/*  Armored car — M8 Greyhound (hull; turret is separate)               */
/* ================================================================== */

function armoredCarHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.22);
  const parts: Part[] = [
    // Faceted hull.
    { g: "box", size: [2.4, 0.7, 5.0], pos: [0, 0.9, 0], color: body },
    { g: "box", size: [2.4, 0.26, 1.4], pos: [0, 1.22, 2.2], rot: [-0.5, 0, 0], color: light },
    { g: "box", size: [2.3, 0.5, 2.2], pos: [0, 1.4, 0.2], color: body },
    // Sloped side skirts.
    { g: "box", size: [0.16, 0.6, 4.6], pos: [1.2, 1.05, 0], rot: [0, 0, 0.18], color: light },
    { g: "box", size: [0.16, 0.6, 4.6], pos: [-1.2, 1.05, 0], rot: [0, 0, -0.18], color: light },
    // Engine deck.
    { g: "box", size: [2.2, 0.16, 1.4], pos: [0, 1.32, -1.9], color: dark },
    // Fenders.
    { g: "box", size: [2.8, 0.1, 4.6], pos: [0, 1.02, 0], color: dark },
  ];
  headlights(parts, 0.95, 1.3, 2.62);
  // 6x6 wheels.
  wheels(parts, 1.24, 0.5, [1.7, -0.6, -1.9]);
  return build(parts);
}

/** Small open-topped turret for the Greyhound. Origin sits on the ring. */
function armoredCarTurretGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const light = shade(tint, 1.22);
  return build([
    { g: "box", size: [1.5, 0.6, 1.6], pos: [0, 0.32, 0], color: body },
    { g: "box", size: [1.2, 0.5, 0.5], pos: [0, 0.34, 0.85], rot: [0.35, 0, 0], color: light },
    { g: "box", size: [1.55, 0.08, 1.65], pos: [0, 0.64, 0], color: shade(tint, 0.7) },
    { g: "cyl", r: 0.28, h: 0.4, seg: 10, pos: [0, 0.34, 0.9], rot: [Math.PI / 2, 0, 0], color: STEEL },
  ]);
}

/** The Greyhound's 37 mm — much slimmer and shorter than a medium's gun. */
function armoredCarBarrelGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.09, h: 2.1, seg: 8, pos: [0, 0, 1.05], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "cyl", r: 0.14, h: 0.4, seg: 8, pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
  ]);
}

/* ================================================================== */
/*  Tank destroyer — StuG III (casemate, no turret)                     */
/* ================================================================== */

function tankDestroyerHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Low hull.
    { g: "box", size: [3.0, 0.8, 6.0], pos: [0, 0.55, 0], color: body },
    // The casemate: a fixed sloped superstructure instead of a turret.
    { g: "box", size: [2.9, 0.7, 3.2], pos: [0, 1.3, 0.3], color: body },
    { g: "box", size: [2.9, 0.3, 1.5], pos: [0, 1.5, 1.85], rot: [-0.55, 0, 0], color: light },
    { g: "box", size: [0.24, 0.6, 3.2], pos: [1.4, 1.32, 0.3], rot: [0, 0, 0.2], color: light },
    { g: "box", size: [0.24, 0.6, 3.2], pos: [-1.4, 1.32, 0.3], rot: [0, 0, -0.2], color: light },
    // Roof with a commander's hatch.
    { g: "box", size: [2.7, 0.1, 3.0], pos: [0, 1.68, 0.3], color: dark },
    { g: "cyl", r: 0.34, h: 0.22, seg: 10, pos: [-0.6, 1.78, -0.5], color: dark },
    // Rear engine deck.
    { g: "box", size: [2.6, 0.14, 1.6], pos: [0, 1.1, -2.4], color: dark },
    { g: "box", size: [1.6, 0.4, 0.5], pos: [0, 1.2, -2.9], color: CANVAS },
  ];
  // Tracks.
  for (const side of [-1, 1]) {
    trackBelt(parts, side * 1.66, {
      width: 0.6, length: 6.2, wheelY: 0.5, wheelR: 0.38, wheelCount: 6, endR: 0.44, endZ: 2.75,
    });
    // Return rollers along the top run.
    for (let i = 0; i < 3; i++) {
      parts.push({
        g: "cyl", r: 0.14, h: 0.34, seg: 6,
        pos: [side * 1.6, 1.02, -1.6 + i * 1.6], rot: [0, 0, Math.PI / 2], color: STEEL_DARK,
      });
    }
  }
  return build(parts);
}

/**
 * The StuG's gun still needs a node to pivot on even though there is no
 * turret, so the rig gets a stub "turret" that carries the mantlet. The
 * narrow `turretArc` in matchConfig is what actually limits its traverse.
 */
function tankDestroyerMantletGeometry(tint: number): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.42, h: 0.55, seg: 10, pos: [0, 0.3, 0.4], rot: [Math.PI / 2, 0, 0], color: STEEL },
    { g: "box", size: [1.0, 0.6, 0.4], pos: [0, 0.3, 0.1], color: shade(tint, 1.2) },
  ]);
}

/* ================================================================== */
/*  Heavy tank — Tiger I (slab-sided, bigger than a medium)             */
/* ================================================================== */

function heavyTankHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Big slab hull — the Tiger's plates are thick but famously near-vertical.
    { g: "box", size: [3.6, 1.0, 6.8], pos: [0, 0.7, 0], color: body },
    { g: "box", size: [3.6, 0.3, 1.2], pos: [0, 1.28, 2.9], rot: [-0.28, 0, 0], color: light },
    { g: "box", size: [3.5, 0.55, 3.6], pos: [0, 1.42, -0.4], color: body },
    // Wide fenders over the interleaved road wheels.
    { g: "box", size: [4.4, 0.12, 6.4], pos: [0, 1.2, 0], color: dark },
    // Engine deck with big circular hatches.
    { g: "box", size: [3.0, 0.16, 1.8], pos: [0, 1.72, -2.4], color: dark },
    { g: "cyl", r: 0.5, h: 0.14, seg: 10, pos: [0, 1.8, -2.4], color: STEEL_DARK },
    { g: "cyl", r: 0.3, h: 0.14, seg: 8, pos: [1.1, 1.8, -2.4], color: STEEL_DARK },
    { g: "cyl", r: 0.3, h: 0.14, seg: 8, pos: [-1.1, 1.8, -2.4], color: STEEL_DARK },
    // Bow MG and spare track links.
    { g: "cyl", r: 0.08, h: 0.9, seg: 6, pos: [0.95, 1.25, 3.1], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "box", size: [1.4, 0.14, 0.5], pos: [0, 1.6, 3.0], color: TRACK },
  ];
  headlights(parts, 1.4, 1.5, 3.2);
  for (const side of [-1, 1]) {
    // Interleaved wheels: more of them, overlapping, is the Tiger's signature.
    trackBelt(parts, side * 1.95, {
      width: 0.78, length: 7.0, wheelY: 0.62, wheelR: 0.52, wheelCount: 8, endR: 0.5, endZ: 3.1,
    });
    // Second, staggered rank of road wheels — the interleaved Schachtellaufwerk.
    for (let i = 0; i < 7; i++) {
      parts.push({
        g: "cyl", r: 0.5, h: 0.4, seg: 10,
        pos: [side * 1.7, 0.62, -2.2 + i * 0.74], rot: [0, 0, Math.PI / 2], color: shade(0x3a3a38, 1.0),
      });
    }
  }
  return build(parts);
}

function heavyTankTurretGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  return build([
    { g: "box", size: [2.8, 1.05, 3.2], pos: [0, 0.55, 0], color: body },
    { g: "box", size: [2.2, 0.9, 0.6], pos: [0, 0.55, 1.7], color: light },
    { g: "cyl", r: 0.5, h: 0.7, seg: 10, pos: [0, 0.55, 1.85], rot: [Math.PI / 2, 0, 0], color: STEEL },
    // Drum cupola.
    { g: "cyl", r: 0.48, h: 0.4, seg: 10, pos: [-0.7, 1.22, -0.7], color: dark },
    { g: "cyl", r: 0.06, h: 0.9, seg: 6, pos: [-0.7, 1.6, -0.3], rot: [Math.PI / 2 - 0.15, 0, 0], color: GUNMETAL },
    // Bustle stowage and spare track.
    { g: "box", size: [2.0, 0.5, 0.5], pos: [0, 0.8, -1.8], color: CANVAS },
    { g: "box", size: [0.12, 0.5, 1.4], pos: [1.44, 0.6, -0.6], color: TRACK },
    { g: "cyl", r: 0.03, h: 1.8, seg: 4, pos: [1.1, 1.9, -1.2], rot: [0.1, 0, 0.08], color: 0x22221e },
  ]);
}

/** Longer, thinner barrel than a medium's — the Tiger's 88. */
function heavyBarrelGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.16, h: 4.6, seg: 10, pos: [0, 0, 2.3], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "cyl", r: 0.22, h: 0.6, seg: 10, pos: [0, 0, 0.4], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    { g: "cyl", r: 0.26, h: 0.55, seg: 10, pos: [0, 0, 4.5], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
  ]);
}

/* ================================================================== */
/*  Heavy half-track — SdKfz 7 artillery tractor                        */
/* ================================================================== */

/**
 * Longer than the 251 and not armoured at all: a soft cab, a long open bed of
 * crew benches, and a great deal more running gear. It exists to drag a gun,
 * so the silhouette is all bed and track.
 */
function heavyHalftrackGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Soft-skin bonnet and cab.
    { g: "box", size: [2.1, 0.85, 2.0], pos: [0, 1.12, 2.9], color: body },
    { g: "box", size: [1.9, 0.75, 0.16], pos: [0, 1.12, 3.94], color: dark },
    { g: "box", size: [2.2, 0.9, 1.5], pos: [0, 1.5, 1.6], color: body },
    { g: "box", size: [1.95, 0.6, 0.1], pos: [0, 1.72, 2.32], rot: [-0.14, 0, 0], color: GLASS },
    // Long open crew bed with bench seats down each side.
    { g: "box", size: [2.3, 0.14, 4.4], pos: [0, 1.24, -1.4], color: dark },
    { g: "box", size: [0.14, 0.55, 4.4], pos: [1.15, 1.5, -1.4], color: body },
    { g: "box", size: [0.14, 0.55, 4.4], pos: [-1.15, 1.5, -1.4], color: body },
    { g: "box", size: [2.3, 0.55, 0.14], pos: [0, 1.5, -3.65], color: body },
    { g: "box", size: [0.55, 0.16, 4.0], pos: [0.72, 1.6, -1.4], color: light },
    { g: "box", size: [0.55, 0.16, 4.0], pos: [-0.72, 1.6, -1.4], color: light },
    // Towing pintle at the tail — the whole point of the vehicle.
    { g: "box", size: [0.3, 0.3, 0.5], pos: [0, 1.05, -3.95], color: STEEL_DARK },
    { g: "cyl", r: 0.13, h: 0.3, seg: 8, pos: [0, 1.05, -4.2], rot: [Math.PI / 2, 0, 0], color: STEEL },
    // Fenders over the front wheels.
    { g: "box", size: [2.5, 0.1, 1.8], pos: [0, 1.0, 3.0], color: dark },
  ];
  headlights(parts, 0.8, 1.45, 3.98);
  wheels(parts, 1.08, 0.46, [3.2]);
  // A long belt with a lot of road wheels: eight tonnes needs the footprint.
  // Built centred and then shifted aft, so it sits under the bed and not the cab.
  for (const side of [-1, 1]) {
    const belt: Part[] = [];
    trackBelt(belt, 0, {
      width: 0.55, length: 5.4, wheelY: 0.5, wheelR: 0.4, wheelCount: 7, endR: 0.44, endZ: 2.3,
    });
    for (const part of belt) {
      part.pos = [side * 1.24, part.pos[1], part.pos[2] - 1.1];
      parts.push(part);
    }
  }
  return build(parts);
}

/* ================================================================== */
/*  Heavy armoured car — SdKfz 234/2 Puma                               */
/* ================================================================== */

function pumaHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.22);
  const parts: Part[] = [
    // Long faceted hull, pointed at both ends — it drives either way.
    { g: "box", size: [2.4, 0.75, 5.4], pos: [0, 1.05, 0], color: body },
    { g: "box", size: [2.4, 0.3, 1.5], pos: [0, 1.38, 2.5], rot: [-0.52, 0, 0], color: light },
    { g: "box", size: [2.4, 0.3, 1.5], pos: [0, 1.38, -2.5], rot: [0.52, 0, 0], color: light },
    { g: "box", size: [2.3, 0.45, 2.6], pos: [0, 1.5, 0], color: body },
    // Sharply angled side skirts, the Puma's signature wedge.
    { g: "box", size: [0.18, 0.7, 5.0], pos: [1.22, 1.15, 0], rot: [0, 0, 0.3], color: light },
    { g: "box", size: [0.18, 0.7, 5.0], pos: [-1.22, 1.15, 0], rot: [0, 0, -0.3], color: light },
    // Fenders and stowage bins.
    { g: "box", size: [2.9, 0.1, 5.0], pos: [0, 1.18, 0], color: dark },
    { g: "box", size: [0.4, 0.3, 1.2], pos: [1.3, 1.4, -1.6], color: dark },
    { g: "box", size: [0.4, 0.3, 1.2], pos: [-1.3, 1.4, -1.6], color: dark },
  ];
  headlights(parts, 1.0, 1.45, 2.98);
  // Eight wheels, all driven, in two pairs at each end.
  wheels(parts, 1.28, 0.52, [2.05, 0.75, -0.75, -2.05]);
  return build(parts);
}

/** Open-topped turret with the 50 mm. Origin sits on the ring. */
function pumaTurretGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const light = shade(tint, 1.22);
  return build([
    { g: "box", size: [1.6, 0.62, 1.9], pos: [0, 0.34, 0], color: body },
    // Faceted front plates rather than a flat face.
    { g: "box", size: [1.3, 0.6, 0.6], pos: [0, 0.34, 1.0], rot: [0.3, 0, 0], color: light },
    { g: "box", size: [0.2, 0.6, 1.9], pos: [0.8, 0.34, 0], rot: [0, 0, 0.22], color: light },
    { g: "box", size: [0.2, 0.6, 1.9], pos: [-0.8, 0.34, 0], rot: [0, 0, -0.22], color: light },
    { g: "box", size: [1.55, 0.08, 1.85], pos: [0, 0.68, 0], color: shade(tint, 0.7) },
    { g: "cyl", r: 0.3, h: 0.45, seg: 10, pos: [0, 0.34, 1.05], rot: [Math.PI / 2, 0, 0], color: STEEL },
  ]);
}

/** 50 mm L/60 — longer and thinner than a 75. */
function pumaBarrelGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.11, h: 3.0, seg: 10, pos: [0, 0, 1.5], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "cyl", r: 0.16, h: 0.45, seg: 10, pos: [0, 0, 0.25], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    { g: "cyl", r: 0.19, h: 0.4, seg: 10, pos: [0, 0, 2.95], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
  ]);
}

/* ================================================================== */
/*  Sloped medium — T-34/76                                             */
/* ================================================================== */

/**
 * The T-34 is one idea applied everywhere: put the plate at sixty degrees.
 * The glacis, the sides and the turret cheeks are all raked, which the armour
 * model rewards directly — the same 45 mm defeats far more than it should.
 * Big Christie road wheels with no return rollers finish the silhouette.
 */
function slopedTankHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.74);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    { g: "box", size: [2.9, 0.7, 6.0], pos: [0, 1.05, 0], color: body },
    // The famous glacis, and a matching rear plate.
    { g: "box", size: [2.9, 0.3, 2.0], pos: [0, 1.45, 2.55], rot: [-0.95, 0, 0], color: light },
    { g: "box", size: [2.9, 0.3, 1.6], pos: [0, 1.42, -2.7], rot: [0.85, 0, 0], color: light },
    // Raked hull sides.
    { g: "box", size: [0.22, 0.8, 5.6], pos: [1.5, 1.15, 0], rot: [0, 0, 0.34], color: light },
    { g: "box", size: [0.22, 0.8, 5.6], pos: [-1.5, 1.15, 0], rot: [0, 0, -0.34], color: light },
    // Deck, engine louvres and the driver's hatch in the glacis.
    { g: "box", size: [2.7, 0.12, 5.4], pos: [0, 1.42, 0], color: dark },
    { g: "box", size: [1.9, 0.14, 1.3], pos: [0, 1.5, -2.0], color: STEEL_DARK },
    { g: "box", size: [1.0, 0.1, 0.7], pos: [-0.55, 1.62, 2.4], rot: [-0.95, 0, 0], color: dark },
    { g: "cyl", r: 0.09, h: 0.8, seg: 6, pos: [0.72, 1.6, 2.7], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    // External fuel drums on the rear flanks — never seen without them.
    { g: "cyl", r: 0.3, h: 1.1, seg: 10, pos: [1.62, 1.55, -1.9], rot: [Math.PI / 2, 0, 0], color: dark },
    { g: "cyl", r: 0.3, h: 1.1, seg: 10, pos: [-1.62, 1.55, -1.9], rot: [Math.PI / 2, 0, 0], color: dark },
    { g: "box", size: [1.4, 0.14, 0.5], pos: [0, 1.6, 2.9], color: TRACK },
  ];
  headlights(parts, 0.95, 1.5, 3.05);
  // Wide tracks on five big road wheels, and no return rollers at all — the
  // top run rides straight on the wheels, which is why a T-34 looks like this.
  for (const side of [-1, 1]) {
    trackBelt(parts, side * 1.62, {
      width: 0.8, length: 6.2, wheelY: 0.66, wheelR: 0.62, wheelCount: 5, endR: 0.5, endZ: 2.75,
    });
  }
  return build(parts);
}

/** Rounded cast turret, cramped and two-man. */
function slopedTankTurretGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.74);
  const light = shade(tint, 1.2);
  return build([
    // Truncated cone reads as a cast turret in a way no box ever will.
    { g: "cyl", r: 1.15, r2: 0.95, h: 0.8, seg: 10, pos: [0, 0.42, 0], color: body },
    { g: "box", size: [1.5, 0.7, 0.7], pos: [0, 0.42, 1.0], rot: [0.22, 0, 0], color: light },
    { g: "cyl", r: 0.34, h: 0.6, seg: 10, pos: [0, 0.42, 1.25], rot: [Math.PI / 2, 0, 0], color: STEEL },
    // Rear overhang and the big split roof hatch.
    { g: "box", size: [1.5, 0.6, 0.7], pos: [0, 0.42, -1.0], rot: [-0.2, 0, 0], color: light },
    { g: "box", size: [1.6, 0.1, 1.0], pos: [0, 0.86, -0.15], color: dark },
    { g: "cyl", r: 0.06, h: 0.9, seg: 6, pos: [-0.8, 1.2, -0.5], rot: [Math.PI / 2 - 0.2, 0, 0], color: GUNMETAL },
  ]);
}

/* ================================================================== */
/*  Great War — rhomboid tank (Mark IV)                                 */
/* ================================================================== */

/**
 * The Mark IV's whole point is the track frame: the belt runs right round the
 * outside of a lozenge-shaped hull, so the tank climbs a parapet by driving
 * its nose up the wall. Drawn as a stack of stepped plates rather than a plain
 * box, which is what gives the rhomboid its profile from the side.
 */
function rhomboidHullGeometry(tint: number, male: boolean): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.74);
  const light = shade(tint, 1.18);
  const parts: Part[] = [
    // Central hull box, low and long.
    { g: "box", size: [2.5, 1.5, 6.2], pos: [0, 1.35, 0], color: body },
    // Stepped nose and tail plates — the lozenge taper.
    { g: "box", size: [2.4, 0.9, 1.1], pos: [0, 2.0, 3.2], rot: [0.5, 0, 0], color: light },
    { g: "box", size: [2.4, 0.9, 1.1], pos: [0, 0.85, 3.5], rot: [-0.55, 0, 0], color: light },
    { g: "box", size: [2.4, 0.9, 1.1], pos: [0, 2.0, -3.2], rot: [-0.5, 0, 0], color: light },
    { g: "box", size: [2.4, 0.9, 1.1], pos: [0, 0.85, -3.5], rot: [0.55, 0, 0], color: light },
    // Roof with the commander's hatch and the exhaust manifold.
    { g: "box", size: [2.3, 0.12, 5.6], pos: [0, 2.14, 0], color: dark },
    // Armoured cab, standing proud of the track frame at the front — after the
    // lozenge itself this is the Mark IV's most recognisable feature.
    { g: "box", size: [1.7, 0.62, 1.5], pos: [0, 2.45, 1.9], color: body },
    { g: "box", size: [1.75, 0.1, 1.55], pos: [0, 2.79, 1.9], color: dark },
    { g: "box", size: [1.2, 0.12, 0.1], pos: [0, 2.5, 2.64], color: 0x141414 },
    { g: "cyl", r: 0.14, h: 3.2, seg: 6, pos: [0, 2.36, -0.6], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    // Unditching rail along the top — the beam every Mark IV carried.
    { g: "box", size: [0.16, 0.16, 5.4], pos: [0.85, 2.46, 0], color: WOOD },
    { g: "box", size: [0.16, 0.16, 5.4], pos: [-0.85, 2.46, 0], color: WOOD },
  ];
  // Sponsons: the guns hang off the sides, which is why it has no turret.
  for (const side of [-1, 1]) {
    const x = side * 1.72;
    parts.push({ g: "box", size: [1.0, 0.9, 1.9], pos: [x, 1.5, 0.3], color: body });
    parts.push({ g: "box", size: [0.24, 0.85, 0.9], pos: [x + side * 0.5, 1.5, 1.1], rot: [0, side * 0.5, 0], color: light });
    if (male) {
      // 6-pdr barrel poking forward-outward out of the sponson.
      parts.push({
        g: "cyl", r: 0.13, h: 1.9, seg: 8,
        pos: [x + side * 0.42, 1.5, 1.55], rot: [Math.PI / 2, side * 0.22, 0], color: GUNMETAL,
      });
    } else {
      // Female: a machine gun in a ball mount instead.
      parts.push({ g: "sphere", r: 0.3, seg: 8, pos: [x + side * 0.4, 1.55, 1.2], color: STEEL });
      parts.push({
        g: "cyl", r: 0.07, h: 1.0, seg: 6,
        pos: [x + side * 0.5, 1.55, 1.6], rot: [Math.PI / 2, side * 0.24, 0], color: GUNMETAL,
      });
    }
  }
  // The track frame itself: a belt that follows the lozenge all the way round.
  // 8 m long and 2.5 m to the top of the belt, per the reference sheet.
  for (const side of [-1, 1]) {
    rhomboidTrack(parts, side * 1.5, 3.75, 1.2, 1.3, body);
  }
  return build(parts);
}

/**
 * One rhomboid track belt: short plates stepped round an ellipse, each rotated
 * to lie tangent to it. Rotating about X maps the plate's +Z axis to
 * (-sin θ, cos θ) in (y, z), so θ is taken against the ellipse's derivative
 * with that sign convention rather than the naive atan2 of the tangent — get
 * it backwards and the belt explodes into a starburst of bars.
 */
function rhomboidTrack(parts: Part[], x: number, rz: number, ry: number, cy: number, body: number) {
  const steps = 30;
  // A plain ellipse reads as a tyre. The Mark IV's frame is a lozenge: long
  // flat runs top and bottom, sharp corners fore and aft. A superellipse with
  // an exponent below 1 flattens the runs and pulls the corners in, which is
  // the whole silhouette in one number.
  const p = 0.7;
  const sup = (t: number) => Math.sign(t) * Math.pow(Math.abs(t), p);
  const at = (a: number) => ({ z: sup(Math.cos(a)) * rz, y: cy + sup(Math.sin(a)) * ry });
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const next = ((i + 1) / steps) * Math.PI * 2;
    const c = at(a);
    const n = at(next);
    const dz = n.z - c.z;
    const dy = n.y - c.y;
    const len = Math.hypot(dy, dz);
    parts.push({
      g: "box",
      // Each plate spans to the next sample, so the belt tiles without gaps.
      size: [0.6, 0.26, len * 1.35],
      pos: [x, (c.y + n.y) / 2, (c.z + n.z) / 2],
      rot: [Math.atan2(-dy, dz), 0, 0],
      color: i % 2 === 0 ? TRACK : STEEL_DARK,
    });
  }
  // Frame plate filling the lozenge, so the tank is not see-through side-on.
  parts.push({ g: "box", size: [0.14, ry * 1.55, rz * 1.5], pos: [x - Math.sign(x) * 0.3, cy, 0], color: body });
  parts.push({ g: "box", size: [0.12, ry * 0.9, rz * 1.85], pos: [x - Math.sign(x) * 0.3, cy, 0], color: shade(body, 0.86) });
}

/* ================================================================== */
/*  Great War — box tank (A7V)                                          */
/* ================================================================== */

function boxTankGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.74);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Slab-sided armoured box, overhanging the running gear at both ends.
    { g: "box", size: [3.2, 1.9, 7.0], pos: [0, 1.7, 0], color: body },
    { g: "box", size: [3.2, 0.5, 1.0], pos: [0, 2.5, 3.3], rot: [-0.5, 0, 0], color: light },
    { g: "box", size: [3.2, 0.5, 1.0], pos: [0, 2.5, -3.3], rot: [0.5, 0, 0], color: light },
    // Roof and the raised commander's cabin — the A7V's distinctive lump.
    { g: "box", size: [3.0, 0.14, 6.6], pos: [0, 2.68, 0], color: dark },
    { g: "box", size: [1.5, 0.7, 1.6], pos: [0, 3.05, -0.3], color: body },
    { g: "box", size: [1.55, 0.12, 1.65], pos: [0, 3.42, -0.3], color: dark },
    { g: "box", size: [1.2, 0.1, 0.08], pos: [0, 3.18, 0.48], color: 0x141414 },
    // Front gun embrasure: the 5.7 cm sits in the nose, not a turret.
    { g: "box", size: [1.3, 0.9, 0.4], pos: [0, 1.75, 3.5], color: light },
    // Machine-gun ball mounts down the flanks.
    { g: "sphere", r: 0.26, seg: 8, pos: [1.6, 2.1, 1.6], color: STEEL },
    { g: "sphere", r: 0.26, seg: 8, pos: [-1.6, 2.1, 1.6], color: STEEL },
    { g: "sphere", r: 0.26, seg: 8, pos: [1.6, 2.1, -1.8], color: STEEL },
    { g: "sphere", r: 0.26, seg: 8, pos: [-1.6, 2.1, -1.8], color: STEEL },
    { g: "box", size: [2.6, 0.14, 0.5], pos: [0, 2.3, -3.4], color: TRACK },
  ];
  headlights(parts, 1.15, 2.2, 3.62);
  // Short track base tucked under a long body — why it bellied out on trenches.
  for (const side of [-1, 1]) {
    trackBelt(parts, side * 1.35, {
      width: 0.62, length: 5.0, wheelY: 0.55, wheelR: 0.42, wheelCount: 6, endR: 0.42, endZ: 2.0,
    });
  }
  return build(parts);
}

/** The A7V's 5.7 cm lives in the nose, so its "turret" is just the mantlet. */
function boxTankMantletGeometry(tint: number): THREE.BufferGeometry {
  return build([
    { g: "box", size: [0.9, 0.7, 0.5], pos: [0, 0.2, 0.15], color: shade(tint, 1.2) },
    { g: "cyl", r: 0.3, h: 0.45, seg: 10, pos: [0, 0.2, 0.4], rot: [Math.PI / 2, 0, 0], color: STEEL },
  ]);
}

/** Short 5.7 cm — a stub next to a WWII 75. */
function shortCannonGeometry(): THREE.BufferGeometry {
  return build([
    { g: "cyl", r: 0.12, h: 1.9, seg: 8, pos: [0, 0, 0.95], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    { g: "cyl", r: 0.17, h: 0.4, seg: 8, pos: [0, 0, 0.18], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
  ]);
}

/* ================================================================== */
/*  Great War — armoured car (Rolls-Royce, Lancia, Austro-Daimler)      */
/* ================================================================== */

function vintageCarHullGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Tall riveted body on a car chassis — narrow, and top-heavy with it.
    { g: "box", size: [1.9, 0.5, 4.6], pos: [0, 0.95, 0], color: dark },
    { g: "box", size: [1.85, 1.0, 2.4], pos: [0, 1.6, -0.5], color: body },
    // Long bonnet with a vertical radiator, 1914 fashion.
    { g: "box", size: [1.5, 0.85, 1.9], pos: [0, 1.4, 1.6], color: body },
    { g: "box", size: [1.35, 1.0, 0.16], pos: [0, 1.45, 2.6], color: light },
    { g: "box", size: [1.15, 0.8, 0.08], pos: [0, 1.45, 2.68], color: 0x2b2b26 },
    // Armoured driver's plate with a viewing flap.
    { g: "box", size: [1.8, 0.6, 0.14], pos: [0, 1.9, 0.75], rot: [-0.16, 0, 0], color: light },
    { g: "box", size: [0.7, 0.1, 0.08], pos: [0, 1.96, 0.83], color: 0x141414 },
    // Running boards and mudguards.
    { g: "box", size: [2.3, 0.1, 3.6], pos: [0, 1.1, 0.2], color: dark },
    // Spare wheel strapped to the tail.
    { g: "cyl", r: 0.42, h: 0.16, seg: 12, pos: [0, 1.4, -2.0], rot: [Math.PI / 2, 0, 0], color: RUBBER },
  ];
  headlights(parts, 0.62, 1.6, 2.66);
  spokedWheels(parts, 1.0, 0.5, [1.5, -1.3]);
  return build(parts);
}

/** Riveted drum turret with a water-cooled MG. Origin sits on the ring. */
function vintageCarTurretGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const light = shade(tint, 1.22);
  return build([
    { g: "cyl", r: 0.62, h: 0.75, seg: 10, pos: [0, 0.38, 0], color: body },
    { g: "cyl", r: 0.5, h: 0.16, seg: 10, pos: [0, 0.82, 0], color: shade(tint, 0.72) },
    // Water jacket around the barrel — the giveaway of a 1916 Vickers.
    { g: "cyl", r: 0.14, h: 0.75, seg: 8, pos: [0, 0.36, 0.7], rot: [Math.PI / 2, 0, 0], color: light },
    { g: "cyl", r: 0.05, h: 0.5, seg: 6, pos: [0, 0.36, 1.2], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
  ]);
}

/**
 * Wooden-spoked artillery wheels. Every wheeled thing in 1917 rides on these,
 * and they are the single clearest signal that a vehicle is not from 1944.
 */
function spokedWheels(parts: Part[], halfWidth: number, radius: number, positions: number[]) {
  for (const side of [-1, 1]) {
    for (const z of positions) {
      const x = side * halfWidth;
      parts.push({
        g: "cyl", r: radius, h: radius * 0.34, seg: 12,
        pos: [x, radius, z], rot: [0, 0, Math.PI / 2], color: RUBBER,
      });
      parts.push({
        g: "cyl", r: radius * 0.82, h: radius * 0.4, seg: 12,
        pos: [x, radius, z], rot: [0, 0, Math.PI / 2], color: WOOD,
      });
      // Spokes, as thin crossed bars rather than twelve separate cylinders.
      for (let i = 0; i < 3; i++) {
        parts.push({
          g: "box", size: [radius * 0.44, radius * 1.6, 0.07],
          pos: [x, radius, z], rot: [0, Math.PI / 2, (i * Math.PI) / 3], color: WOOD_DARK,
        });
      }
      parts.push({
        g: "cyl", r: radius * 0.2, h: radius * 0.5, seg: 8,
        pos: [x, radius, z], rot: [0, 0, Math.PI / 2], color: STEEL,
      });
    }
  }
}

/* ================================================================== */
/*  Great War — towed artillery and the wagon                           */
/* ================================================================== */

/**
 * A gun carriage: shield, axle, two spoked wheels and a split trail. `big`
 * builds the Schneider 155 rather than the 75, which is the same arrangement
 * scaled up with a heavier shield.
 */
function gunCarriageGeometry(tint: number, big: boolean): THREE.BufferGeometry {
  const k = big ? 1.28 : 1.0;
  const body = tint;
  const dark = shade(tint, 0.74);
  const parts: Part[] = [
    // Axle and cradle.
    { g: "box", size: [1.8 * k, 0.22, 0.4], pos: [0, 0.62 * k, 0], color: dark },
    { g: "box", size: [0.55 * k, 0.4 * k, 1.3 * k], pos: [0, 0.8 * k, 0.1], color: body },
    // Gun shield — thin, angled, and all the protection the crew ever gets.
    { g: "box", size: [2.0 * k, 1.1 * k, 0.1], pos: [0, 0.95 * k, 0.42 * k], rot: [-0.2, 0, 0], color: body },
    { g: "box", size: [2.05 * k, 0.1, 0.12], pos: [0, 1.5 * k, 0.32 * k], color: dark },
    // Split trail dragging back to the spades.
    { g: "box", size: [0.16, 0.16, 2.6 * k], pos: [0.32, 0.34, -1.5 * k], rot: [0.12, 0, 0], color: dark },
    { g: "box", size: [0.16, 0.16, 2.6 * k], pos: [-0.32, 0.34, -1.5 * k], rot: [0.12, 0, 0], color: dark },
    { g: "box", size: [0.9, 0.14, 0.4], pos: [0, 0.12, -2.7 * k], color: STEEL_DARK },
  ];
  spokedWheels(parts, 0.92 * k, 0.62 * k, [0]);
  return build(parts);
}

/** The gun itself pivots on the carriage, so it lives on the turret node. */
function gunBarrelMountGeometry(tint: number, big: boolean): THREE.BufferGeometry {
  const k = big ? 1.3 : 1.0;
  return build([
    { g: "box", size: [0.5 * k, 0.4 * k, 0.9 * k], pos: [0, 0.1, 0], color: shade(tint, 1.18) },
    { g: "cyl", r: 0.2 * k, h: 0.5 * k, seg: 10, pos: [0, 0.1, 0.4 * k], rot: [Math.PI / 2, 0, 0], color: STEEL },
  ]);
}

/** Long thin 75 mm tube, or the 155's shorter, fatter one. */
function towedGunBarrelGeometry(big: boolean): THREE.BufferGeometry {
  return big
    ? build([
        { g: "cyl", r: 0.19, h: 3.0, seg: 10, pos: [0, 0, 1.5], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
        { g: "cyl", r: 0.26, h: 0.7, seg: 10, pos: [0, 0, 0.35], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
      ])
    : build([
        { g: "cyl", r: 0.11, h: 3.4, seg: 10, pos: [0, 0, 1.7], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
        { g: "cyl", r: 0.17, h: 0.55, seg: 10, pos: [0, 0, 0.3], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
      ]);
}

function wagonGeometry(tint: number): THREE.BufferGeometry {
  const wood = tint;
  const dark = shade(tint, 0.7);
  const parts: Part[] = [
    // Plank bed with side and end boards.
    { g: "box", size: [1.7, 0.14, 3.2], pos: [0, 1.0, 0], color: wood },
    { g: "box", size: [0.12, 0.6, 3.2], pos: [0.86, 1.32, 0], color: wood },
    { g: "box", size: [0.12, 0.6, 3.2], pos: [-0.86, 1.32, 0], color: wood },
    { g: "box", size: [1.7, 0.6, 0.12], pos: [0, 1.32, 1.62], color: wood },
    { g: "box", size: [1.7, 0.6, 0.12], pos: [0, 1.32, -1.62], color: wood },
    // Frame rails and the draught pole the horses were hitched to.
    { g: "box", size: [0.16, 0.16, 3.4], pos: [0.5, 0.88, 0], color: dark },
    { g: "box", size: [0.16, 0.16, 3.4], pos: [-0.5, 0.88, 0], color: dark },
    { g: "box", size: [0.12, 0.12, 2.4], pos: [0, 0.72, 2.7], rot: [-0.08, 0, 0], color: dark },
    { g: "box", size: [0.9, 0.1, 0.12], pos: [0, 0.68, 3.7], color: dark },
  ];
  spokedWheels(parts, 0.88, 0.58, [1.15, -1.15]);
  return build(parts);
}

/* ================================================================== */
/*  Great War — biplanes (Camel, Dr.I, SPAD)                            */
/* ================================================================== */

/**
 * Two stacked wings, struts between them, and an open cockpit. The nose points
 * +Z to match the existing plane rig, which is the opposite of the camera's
 * forward — the aircraft control code already accounts for that.
 */
function biplaneGeometry(tint: number, triplane: boolean): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.2);
  const parts: Part[] = [
    // Fabric fuselage, tapering to the tail.
    { g: "box", size: [0.72, 0.8, 3.6], pos: [0, 0.9, 0.2], color: body },
    { g: "box", size: [0.5, 0.5, 1.5], pos: [0, 0.95, -2.2], color: body },
    // Rotary engine cowling.
    { g: "cyl", r: 0.44, h: 0.7, seg: 10, pos: [0, 0.95, 2.3], rot: [Math.PI / 2, 0, 0], color: STEEL_DARK },
    // Open cockpit and headrest.
    { g: "box", size: [0.5, 0.24, 0.7], pos: [0, 1.32, 0.1], color: 0x1e1c18 },
    { g: "box", size: [0.42, 0.26, 0.24], pos: [0, 1.36, -0.4], color: dark },
    // Tailplane and fin.
    { g: "box", size: [2.0, 0.09, 0.7], pos: [0, 1.0, -2.8], color: light },
    { g: "box", size: [0.09, 0.75, 0.8], pos: [0, 1.35, -2.9], color: light },
  ];

  // Wings. The Dr.I gets three, everything else two — same builder either way.
  // Spread far enough apart that each wing clears the fuselage box — stacked
  // too close, the lower ones vanish inside it and a triplane reads as a
  // biplane.
  const wingYs = triplane ? [0.38, 1.16, 1.98] : [0.4, 1.66];
  const spans = triplane ? [4.6, 5.0, 4.4] : [5.6, 5.4];
  wingYs.forEach((y, i) => {
    parts.push({ g: "box", size: [spans[i], 0.1, 1.05], pos: [0, y, 0.9], color: light });
    // Ailerons, a shade darker so the wing has an edge.
    parts.push({ g: "box", size: [spans[i], 0.06, 0.22], pos: [0, y, 0.3], color: dark });
  });
  // Interplane struts between each pair of wings, plus cabane struts at the root.
  for (let i = 0; i < wingYs.length - 1; i++) {
    const y = (wingYs[i] + wingYs[i + 1]) / 2;
    const h = wingYs[i + 1] - wingYs[i];
    for (const x of [-1.7, 1.7, -0.45, 0.45]) {
      parts.push({ g: "box", size: [0.07, h, 0.09], pos: [x, y, 0.9], color: WOOD_DARK });
    }
  }
  // Fixed undercarriage: two wheels on a V of struts, plus a tail skid.
  for (const side of [-1, 1]) {
    parts.push({ g: "box", size: [0.08, 0.5, 0.09], pos: [side * 0.46, 0.3, 1.6], rot: [0, 0, side * 0.3], color: WOOD_DARK });
    parts.push({ g: "cyl", r: 0.24, h: 0.11, seg: 10, pos: [side * 0.56, 0.24, 1.6], rot: [0, 0, Math.PI / 2], color: RUBBER });
  }
  parts.push({ g: "box", size: [0.07, 0.4, 0.1], pos: [0, 0.5, -3.0], rot: [0.4, 0, 0], color: WOOD_DARK });
  // Twin synchronised guns over the cowling.
  for (const side of [-1, 1]) {
    parts.push({
      g: "cyl", r: 0.05, h: 0.9, seg: 6,
      pos: [side * 0.16, 1.3, 1.5], rot: [Math.PI / 2, 0, 0], color: GUNMETAL,
    });
  }
  return build(parts);
}

/* ================================================================== */
/*  Public builders                                                     */
/* ================================================================== */

/**
 * Hull mesh for a vehicle. Aircraft are handled by the existing plane rig and
 * return null here; everything else gets a ground hull.
 */
export function hullGeometryFor(def: VehicleDef): THREE.BufferGeometry | null {
  switch (def.chassis) {
    case "light_car":
      return lightCarGeometry(def.tint);
    case "motorcycle":
      return motorcycleGeometry(def.tint);
    case "truck":
      // The Opel Blitz carries a canvas tilt; the GMC runs open.
      return truckGeometry(def.tint, def.id === "opel_blitz");
    case "amphibious":
      return amphibiousGeometry(def.tint);
    case "halftrack":
      return halftrackGeometry(def.tint, def.id === "sdkfz_251");
    case "armored_car":
      return armoredCarHullGeometry(def.tint);
    case "tank_destroyer":
      return tankDestroyerHullGeometry(def.tint);
    case "heavy_tank":
      return heavyTankHullGeometry(def.tint);
    case "medium_tank":
      return null; // uses the existing tankHullGeometry, tinted by team
    case "fighter":
      return null; // uses the existing planeBody geometry, tinted by team
    case "heavy_halftrack":
      return heavyHalftrackGeometry(def.tint);
    case "heavy_armored_car":
      return pumaHullGeometry(def.tint);
    case "sloped_medium":
      return slopedTankHullGeometry(def.tint);
    case "rhomboid_tank":
      return rhomboidHullGeometry(def.tint, def.weapons.includes("sixpdr"));
    case "box_tank":
      return boxTankGeometry(def.tint);
    case "vintage_armored_car":
      return vintageCarHullGeometry(def.tint);
    case "field_gun":
      return gunCarriageGeometry(def.tint, false);
    case "howitzer":
      return gunCarriageGeometry(def.tint, true);
    case "wagon":
      return wagonGeometry(def.tint);
    case "biplane":
      return biplaneGeometry(def.tint, def.id === "fokker_dr1");
  }
}

/** Turret mesh, or null for chassis that have no traversing turret. */
export function turretGeometryFor(def: VehicleDef): THREE.BufferGeometry | null {
  switch (def.chassis) {
    case "armored_car":
      return armoredCarTurretGeometry(def.tint);
    case "tank_destroyer":
      return tankDestroyerMantletGeometry(def.tint);
    case "heavy_tank":
      return heavyTankTurretGeometry(def.tint);
    case "medium_tank":
      return null; // existing tankTurretGeometry
    case "heavy_armored_car":
      return pumaTurretGeometry(def.tint);
    case "sloped_medium":
      return slopedTankTurretGeometry(def.tint);
    case "vintage_armored_car":
      return vintageCarTurretGeometry(def.tint);
    case "box_tank":
      return boxTankMantletGeometry(def.tint);
    case "field_gun":
      return gunBarrelMountGeometry(def.tint, false);
    case "howitzer":
      return gunBarrelMountGeometry(def.tint, true);
    // Rhomboids carry their guns in fixed sponsons that are part of the hull,
    // so there is nothing to put on the turret node.
    default:
      return null;
  }
}

/** Barrel mesh for chassis whose gun differs from the standard medium's. */
export function barrelGeometryFor(def: VehicleDef): THREE.BufferGeometry | null {
  switch (def.chassis) {
    case "heavy_tank":
      return heavyBarrelGeometry();
    case "armored_car":
      return armoredCarBarrelGeometry();
    case "heavy_armored_car":
      return pumaBarrelGeometry();
    case "box_tank":
      return shortCannonGeometry();
    case "field_gun":
      return towedGunBarrelGeometry(false);
    case "howitzer":
      return towedGunBarrelGeometry(true);
    default:
      return null; // medium/TD reuse tankBarrelGeometry
  }
}

/**
 * Where the barrel's breech end sits in turret-local space. The medium tank's
 * turret is deep enough to swallow a gun mounted well forward; the Greyhound's
 * little turret is not, so mounting every chassis at the same offset leaves
 * its gun floating in front of the vehicle.
 */
export function barrelMount(chassis: Chassis): [number, number, number] {
  switch (chassis) {
    case "armored_car":
      return [0, 0.34, 0.72];
    case "heavy_armored_car":
      return [0, 0.34, 1.05];
    case "sloped_medium":
      return [0, 0.42, 1.2];
    case "box_tank":
      return [0, 0.2, 0.35];
    case "field_gun":
      return [0, 0.1, 0.3];
    case "howitzer":
      return [0, 0.13, 0.4];
    case "tank_destroyer":
      return [0, 0.3, 0.3];
    case "heavy_tank":
      return [0, 0.55, 1.7];
    default:
      return [0, 0.5, 1.45]; // medium tank
  }
}

/** Where the turret ring sits above the hull origin, per chassis. */
export function turretRingHeight(chassis: Chassis): number {
  switch (chassis) {
    case "armored_car":
      return 1.65;
    case "vintage_armored_car":
      return 2.05;
    case "heavy_armored_car":
      return 1.72;
    case "sloped_medium":
      return 1.48;
    case "box_tank":
      return 1.75;
    case "field_gun":
      return 0.85;
    case "howitzer":
      return 1.05;
    case "tank_destroyer":
      return 1.3;
    case "heavy_tank":
      return 1.7;
    default:
      return 1.45; // medium tank
  }
}

/** Does this chassis have any gun at all? */
export function isArmed(def: VehicleDef): boolean {
  return def.weapons.length > 0;
}

/** Does this vehicle carry a main gun (as opposed to just machine guns)? */
export function hasCannon(def: VehicleDef): boolean {
  return mainGunOf(def.id) !== null;
}
