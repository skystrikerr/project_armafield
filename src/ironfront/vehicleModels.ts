import * as THREE from "three";
import { build, type Part } from "./models";
import type { Chassis, VehicleDef } from "./matchConfig";

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

function halftrackGeometry(tint: number): THREE.BufferGeometry {
  const body = tint;
  const dark = shade(tint, 0.72);
  const light = shade(tint, 1.25);
  const parts: Part[] = [
    // Sloped armoured nose.
    { g: "box", size: [2.2, 0.8, 1.8], pos: [0, 1.0, 2.3], color: body },
    { g: "box", size: [2.2, 0.28, 1.0], pos: [0, 1.42, 2.9], rot: [-0.7, 0, 0], color: light },
    // Crew compartment. The 251's signature is its sharply tapered flanks, so
    // the sides are separate plates canted well outboard of the body box.
    { g: "box", size: [1.9, 0.9, 3.4], pos: [0, 1.25, -0.5], color: body },
    { g: "box", size: [0.22, 1.0, 3.4], pos: [1.12, 1.28, -0.5], rot: [0, 0, 0.34], color: light },
    { g: "box", size: [0.22, 1.0, 3.4], pos: [-1.12, 1.28, -0.5], rot: [0, 0, -0.34], color: light },
    // Tapered tail plates, drawing the rear in to a narrow door.
    { g: "box", size: [0.22, 0.95, 1.1], pos: [0.78, 1.26, -2.0], rot: [0, 0.5, 0.34], color: light },
    { g: "box", size: [0.22, 0.95, 1.1], pos: [-0.78, 1.26, -2.0], rot: [0, -0.5, -0.34], color: light },
    // Open top: a rim rather than a roof.
    { g: "box", size: [2.3, 0.1, 3.4], pos: [0, 1.74, -0.5], color: dark },
    // Vision slit.
    { g: "box", size: [1.4, 0.14, 0.1], pos: [0, 1.42, 1.42], color: 0x1a1a1a },
    // Pintle MG at the front of the troop bay.
    { g: "box", size: [0.4, 0.28, 0.4], pos: [0, 1.85, 1.1], color: GUNMETAL },
    { g: "cyl", r: 0.06, h: 1.0, seg: 6, pos: [0, 1.98, 1.6], rot: [Math.PI / 2, 0, 0], color: GUNMETAL },
    // Rear doors, narrow because the flanks have converged by this point.
    { g: "box", size: [1.3, 0.85, 0.14], pos: [0, 1.25, -2.45], color: dark },
  ];
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
      return halftrackGeometry(def.tint);
    case "armored_car":
      return armoredCarHullGeometry(def.tint);
    case "tank_destroyer":
      return tankDestroyerHullGeometry(def.tint);
    case "heavy_tank":
      return heavyTankHullGeometry(def.tint);
    case "medium_tank":
      return null; // uses the existing tankHullGeometry, tinted by team
    case "fighter":
      return null; // uses the existing plane rig
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
    default:
      return null;
  }
}

/** Barrel mesh for chassis whose gun differs from the standard medium's. */
export function barrelGeometryFor(def: VehicleDef): THREE.BufferGeometry | null {
  if (def.chassis === "heavy_tank") return heavyBarrelGeometry();
  if (def.chassis === "armored_car") return armoredCarBarrelGeometry();
  return null; // medium/TD reuse tankBarrelGeometry
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

/** Does this chassis carry a main cannon (as opposed to just an MG)? */
export function hasCannon(def: VehicleDef): boolean {
  return def.weapons.includes("cannon");
}
