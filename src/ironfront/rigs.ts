import * as THREE from "three";
import {
  launcherGeometry,
  lowPolyMaterial,
  propellerGeometry,
  rifleGeometry,
  soldierArmsGeometry,
  soldierLegGeometry,
  soldierTorsoGeometry,
  tankBarrelGeometry,
  tankHullGeometry,
  tankTurretGeometry,
  wreckGeometry,
} from "./models";
import { weaponCategory } from "./eras";
import { mainGunOf, vehicleById, type VehicleDef } from "./matchConfig";
import {
  barrelGeometryFor,
  barrelMount,
  hullGeometryFor,
  propellerMount,
  turretGeometryFor,
  turretRingHeight,
} from "./vehicleModels";
import {
  TANK_RING_Y,
  TEAM_COLOR,
  type Plane,
  type Soldier,
  type Tank,
  type Team,
} from "./units";

/**
 * The visual half of a unit. Simulation state lives in plain objects; a rig is
 * the pile of three.js nodes that gets pushed around to match it each frame.
 */

/** Geometries are shared across every unit of a team, built once up front. */
export class RigAssets {
  readonly material = lowPolyMaterial();
  readonly hull: Record<Team, THREE.BufferGeometry>;
  readonly turret: Record<Team, THREE.BufferGeometry>;
  readonly torso: Record<Team, THREE.BufferGeometry>;
  readonly barrel = tankBarrelGeometry();
  readonly leg = soldierLegGeometry();
  readonly arms = soldierArmsGeometry();
  readonly rifle = rifleGeometry();
  readonly launcher = launcherGeometry();
  readonly propeller = propellerGeometry();
  readonly wreck = wreckGeometry();

  constructor() {
    const teams: Team[] = ["blue", "red"];
    const rec = <T>(fn: (t: Team) => T) =>
      Object.fromEntries(teams.map((t) => [t, fn(t)])) as Record<Team, T>;
    this.hull = rec(tankHullGeometry);
    this.turret = rec(tankTurretGeometry);
    this.torso = rec(soldierTorsoGeometry);
  }

  /**
   * Geometry for catalog vehicles, built on first request and shared by every
   * instance of that vehicle. Chassis that reuse the stock medium-tank meshes
   * fall back to the per-team ones above.
   */
  private vehicleCache = new Map<string, { hull: THREE.BufferGeometry; turret: THREE.BufferGeometry | null; barrel: THREE.BufferGeometry }>();

  vehicleGeometry(def: VehicleDef, team: Team) {
    const key = `${def.id}:${team}`;
    const cached = this.vehicleCache.get(key);
    if (cached) return cached;
    const entry = {
      hull: hullGeometryFor(def) ?? this.hull[team],
      turret: turretGeometryFor(def) ?? (def.chassis === "medium_tank" ? this.turret[team] : null),
      barrel: barrelGeometryFor(def) ?? this.barrel,
    };
    this.vehicleCache.set(key, entry);
    return entry;
  }

  dispose() {
    const all: THREE.BufferGeometry[] = [
      this.barrel, this.leg, this.arms, this.rifle, this.launcher, this.propeller, this.wreck,
      ...Object.values(this.hull), ...Object.values(this.turret),
      ...Object.values(this.torso),
    ];
    for (const g of all) g.dispose();
    // Cached vehicle meshes may alias the shared ones above, so only dispose
    // geometry this cache actually created.
    for (const entry of this.vehicleCache.values()) {
      if (!all.includes(entry.hull)) entry.hull.dispose();
      if (entry.turret && !all.includes(entry.turret)) entry.turret.dispose();
      if (!all.includes(entry.barrel)) entry.barrel.dispose();
    }
    this.material.dispose();
  }
}

/**
 * Friendly markers are drawn from a generated chevron rather than a bare
 * sprite, which otherwise renders as a solid white square.
 */
let markerTexture: THREE.Texture | null = null;

function chevronTexture() {
  if (markerTexture) return markerTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(size / 2, size * 0.82);
  ctx.lineTo(size * 0.12, size * 0.2);
  ctx.lineTo(size / 2, size * 0.42);
  ctx.lineTo(size * 0.88, size * 0.2);
  ctx.closePath();
  ctx.fill();
  markerTexture = new THREE.CanvasTexture(canvas);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  return markerTexture;
}

function marker(team: Team, scale: number, height: number) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: chevronTexture(),
      color: TEAM_COLOR[team].hud,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    }),
  );
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(0, height, 0);
  sprite.renderOrder = 5;
  return sprite;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ---------------- infantry ---------------- */

export class SoldierRig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private armsPivot = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private rifle: THREE.Mesh;
  private launcher: THREE.Mesh;
  /** Marker floating above friendlies so a firefight stays legible. */
  readonly marker: THREE.Sprite;

  constructor(assets: RigAssets, team: Team) {
    const mat = assets.material;
    for (const side of [-1, 1]) {
      const leg = mesh(assets.leg, mat);
      leg.position.set(side * 0.16, 0, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.torso.add(mesh(assets.torso[team], mat));
    this.armsPivot.position.set(0, 0.62, 0);
    this.rifle = mesh(assets.rifle, mat);
    this.rifle.position.set(0.06, -0.3, 0.22);
    this.launcher = mesh(assets.launcher, mat);
    this.launcher.position.set(0.06, -0.22, 0.2);
    this.launcher.visible = false;
    this.armsPivot.add(mesh(assets.arms, mat), this.rifle, this.launcher);
    this.torso.add(this.armsPivot);
    this.body.add(this.torso);
    this.root.add(this.body);

    this.marker = marker(team, 0.45, 2.35);
    this.root.add(this.marker);
  }

  update(s: Soldier, showMarker: boolean, hidden: boolean) {
    this.root.visible = !hidden;
    if (hidden) return;
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.yaw;
    this.marker.visible = showMarker && s.alive;

    if (!s.alive) {
      // Fallen: face down, flat on the ground, arms out of the way.
      this.body.position.y = 0.24;
      this.body.rotation.x = Math.PI / 2;
      this.torso.rotation.y = 0;
      this.armsPivot.rotation.x = 0.2;
      for (let i = 0; i < 2; i++) this.legs[i].rotation.x = i === 0 ? 0.2 : -0.15;
      this.rifle.visible = false;
      this.launcher.visible = false;
      return;
    }

    const hipY = s.stance === "stand" ? 0.9 : s.stance === "crouch" ? 0.62 : 0.3;
    this.body.position.y = hipY;
    this.body.rotation.x = s.stance === "prone" ? Math.PI / 2 : 0;

    // Legs swing on the gait phase when moving, and settle when still.
    const moving = Math.hypot(s.vel.x, s.vel.z) > 0.4;
    const swing = moving ? Math.sin(s.gait * 2.4) * (s.sprinting ? 0.85 : 0.55) : 0;
    const bend = s.stance === "crouch" ? 0.85 : 0;
    this.legs[0].rotation.x = swing + bend;
    this.legs[1].rotation.x = -swing + bend;

    // Upper body twists towards where the soldier is looking.
    this.torso.rotation.y = wrap(s.aimYaw - s.yaw);
    this.torso.rotation.x = s.stance === "prone" ? -Math.PI / 2 + 0.25 : 0;
    this.armsPivot.rotation.x = -s.aimPitch + (moving && !s.sprinting ? Math.sin(s.gait * 4.8) * 0.05 : 0);
    // Sprinting soldiers carry the weapon low.
    this.armsPivot.rotation.z = s.sprinting ? -0.5 : 0;

    // Only two weapon meshes exist today — everything reads as the rifle
    // silhouette except AT weapons, which read as the launcher. A wider
    // roster of low-poly meshes is a follow-up art pass, not a data one.
    const heavy = weaponCategory(s.weapon) === "heavy";
    this.rifle.visible = !heavy;
    this.launcher.visible = heavy;
  }

  dispose() {
    (this.marker.material as THREE.Material).dispose();
  }
}

/* ---------------- armour ---------------- */

export class TankRig {
  readonly root = new THREE.Group();
  private hull: THREE.Mesh;
  private turret = new THREE.Group();
  private barrel = new THREE.Group();
  private wreck: THREE.Mesh;
  readonly marker: THREE.Sprite;

  constructor(assets: RigAssets, team: Team, defId = "m4_sherman") {
    const mat = assets.material;
    const def = vehicleById(defId);
    const geo = assets.vehicleGeometry(def, team);

    this.hull = mesh(geo.hull, mat);
    this.root.add(this.hull);

    // Turretless chassis (trucks, half-tracks, cars) still get the node so
    // the update path stays uniform — it just carries no mesh and never moves.
    this.turret.position.set(0, turretRingHeight(def.chassis), def.chassis === "medium_tank" ? -0.25 : 0);
    if (geo.turret) this.turret.add(mesh(geo.turret, mat));
    if (mainGunOf(def.id)) {
      this.barrel.position.set(...barrelMount(def.chassis));
      this.barrel.add(mesh(geo.barrel, mat));
      this.turret.add(this.barrel);
    }
    this.root.add(this.turret);

    this.wreck = mesh(assets.wreck, mat);
    this.wreck.visible = false;
    this.root.add(this.wreck);

    this.marker = marker(team, 0.7, 3.6);
    this.root.add(this.marker);
  }

  update(t: Tank, showMarker: boolean, hideForFirstPerson: boolean) {
    this.root.position.copy(t.pos);
    this.root.rotation.set(t.pitch, t.yaw, t.roll, "YXZ");
    const dead = !t.alive;
    this.hull.visible = !dead && !hideForFirstPerson;
    this.turret.visible = !dead && !hideForFirstPerson;
    this.wreck.visible = dead;
    this.marker.visible = showMarker && !dead;
    if (dead) return;
    this.turret.rotation.y = t.turret;
    this.barrel.rotation.x = -t.barrel;
  }

  dispose() {
    (this.marker.material as THREE.Material).dispose();
  }
}

/* ---------------- aircraft ---------------- */

export class PlaneRig {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private prop: THREE.Mesh;
  /** False for bombers, whose blades are baked into the nacelles. */
  private hasProp: boolean;
  readonly marker: THREE.Sprite;
  private spin = 0;

  constructor(assets: RigAssets, team: Team, defId = "fighter_allied") {
    const mat = assets.material;
    const def = vehicleById(defId);
    // Biplanes bring their own airframe; the WWII monoplane uses the shared one.
    this.body = mesh(assets.vehicleGeometry(def, team).hull, mat);
    this.root.add(this.body);
    // Airscrew size and position vary a great deal across the roster — the
    // shared prop mesh dwarfs a Camel and sits inside a Stuka's nose unless it
    // is placed per type. Bombers return null and bake their blades in.
    this.prop = mesh(assets.propeller, mat);
    const spinner = propellerMount(def);
    this.hasProp = spinner !== null;
    if (spinner) {
      this.prop.position.set(...spinner.pos);
      this.prop.scale.setScalar(spinner.scale);
      this.root.add(this.prop);
    } else {
      this.prop.visible = false;
    }

    this.marker = marker(team, 0.9, 2.6);
    this.root.add(this.marker);
  }

  update(p: Plane, dt: number, showMarker: boolean, hide: boolean) {
    this.root.visible = p.alive;
    if (!p.alive) return;
    this.root.position.copy(p.pos);
    this.root.quaternion.copy(p.quat);
    this.body.visible = !hide;
    this.prop.visible = this.hasProp && !hide;
    this.marker.visible = showMarker;
    this.spin += dt * (6 + p.throttle * 60);
    this.prop.rotation.z = this.spin;
  }

  dispose() {
    (this.marker.material as THREE.Material).dispose();
  }
}

function wrap(a: number) {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}
