import * as THREE from "three";
import {
  launcherGeometry,
  lowPolyMaterial,
  propellerGeometry,
  rifleGeometry,
  tankBarrelGeometry,
  tankHullGeometry,
  tankTurretGeometry,
  wreckGeometry,
} from "./models";
import { soldierArmsFor, soldierLegFor, soldierTorsoFor, viewHandsGeometry, weaponGeometry, weaponGrip } from "./weaponModels";
import { vehicleById, type VehicleDef } from "./matchConfig";
import { lerp } from "./random";
import {
  barrelGeometryFor,
  barrelMount,
  hasBarrel,
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
  /** Uniforms are per nation, not per team: two khaki armies need to differ. */
  private uniformCache = new Map<string, { torso: THREE.BufferGeometry; arms: THREE.BufferGeometry; leg: THREE.BufferGeometry }>();
  readonly barrel = tankBarrelGeometry();
  readonly rifle = rifleGeometry();
  readonly launcher = launcherGeometry();
  private weaponCache = new Map<string, THREE.BufferGeometry>();

  /** Torso, arms and legs in one nation's kit, built once per nation and team. */
  uniformGeometry(nation: string, team: Team) {
    const key = `${nation}:${team}`;
    const hit = this.uniformCache.get(key);
    if (hit) return hit;
    const entry = {
      torso: soldierTorsoFor(nation, TEAM_COLOR[team].primary),
      arms: soldierArmsFor(nation),
      leg: soldierLegFor(nation),
    };
    this.uniformCache.set(key, entry);
    return entry;
  }
  readonly propeller = propellerGeometry();
  readonly wreck = wreckGeometry();

  constructor() {
    const teams: Team[] = ["blue", "red"];
    const rec = <T>(fn: (t: Team) => T) =>
      Object.fromEntries(teams.map((t) => [t, fn(t)])) as Record<Team, T>;
    this.hull = rec(tankHullGeometry);
    this.turret = rec(tankTurretGeometry);
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

  /** One mesh per weapon id, built the first time that weapon is drawn. */
  weaponGeometryFor(weaponId: string): THREE.BufferGeometry {
    let geo = this.weaponCache.get(weaponId);
    if (!geo) {
      geo = weaponGeometry(weaponId);
      this.weaponCache.set(weaponId, geo);
    }
    return geo;
  }

  dispose() {
    const all: THREE.BufferGeometry[] = [
      this.barrel, this.rifle, this.launcher, this.propeller, this.wreck,
      ...Object.values(this.hull), ...Object.values(this.turret),
    ];
    for (const g of all) g.dispose();
    for (const g of this.weaponCache.values()) g.dispose();
    this.weaponCache.clear();
    for (const u of this.uniformCache.values()) {
      u.torso.dispose();
      u.arms.dispose();
      u.leg.dispose();
    }
    this.uniformCache.clear();
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
  /** The weapon currently in the soldier's hands, swapped when it changes. */
  private weapon: THREE.Mesh;
  private weaponId = "";
  private readonly assets: RigAssets;
  /** Marker floating above friendlies so a firefight stays legible. */
  readonly marker: THREE.Sprite;

  constructor(assets: RigAssets, team: Team, nation = "usa") {
    const mat = assets.material;
    this.assets = assets;
    const kit = assets.uniformGeometry(nation, team);
    for (const side of [-1, 1]) {
      const leg = mesh(kit.leg, mat);
      leg.position.set(side * 0.16, 0, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.torso.add(mesh(kit.torso, mat));
    this.armsPivot.position.set(0, 0.62, 0);
    this.weapon = mesh(assets.rifle, mat);
    this.weapon.position.set(0.06, -0.3, 0.22);
    this.armsPivot.add(mesh(kit.arms, mat), this.weapon);
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
      this.weapon.visible = false;
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

    // Each weapon has its own silhouette, so the mesh is swapped whenever the
    // soldier changes weapon rather than toggling between two fixed ones.
    this.weapon.visible = true;
    if (s.weapon !== this.weaponId) {
      this.weaponId = s.weapon;
      this.weapon.geometry = this.assets.weaponGeometryFor(s.weapon);
      this.weapon.position.set(...weaponGrip(s.weapon));
    }
  }

  dispose() {
    (this.marker.material as THREE.Material).dispose();
  }
}

/**
 * The weapon in the player's own hands, in first person.
 *
 * The soldier rig is hidden for the player when the camera is at their eyes —
 * you would be looking at the inside of your own head — which used to hide the
 * weapon along with it, so the player fought with empty hands. This is a
 * separate copy of the weapon parented to the camera instead of to a body.
 *
 * It lives in the main render pass rather than a second overlay pass, so the
 * field of view the world is drawn with also applies here. Aiming down the
 * sights narrows the FOV to zoom, which would blow the weapon up to fill the
 * screen; pushing it away by exactly the amount the zoom magnifies keeps it
 * the same size on screen at every FOV.
 */
/**
 * How large the weapon is drawn relative to its true size. The world uses a
 * wide 72° field so the battlefield reads, and anything held at the camera
 * under that field is enormous. Games solve this with a second, narrower FOV
 * for the viewmodel alone; with a single render pass the equivalent is simply
 * to draw the weapon smaller.
 */
const VIEW_SCALE = 0.72;

export class ViewModel {
  readonly root = new THREE.Group();
  private hold = new THREE.Group();
  private weapon: THREE.Mesh;
  private hands: THREE.Mesh;
  private weaponId = "";
  private nation = "";
  private readonly assets: RigAssets;
  private handsCache = new Map<string, THREE.BufferGeometry>();
  /** Recoil offset and its velocity, in metres along the sight line. */
  private kick = 0;
  private kickVel = 0;
  private lastFlash = 0;
  /** Smoothed 0 (hip) to 1 (sighted), so the weapon rises rather than snaps. */
  private ads = 0;
  private sway = 0;
  /** How far the current weapon's stock sits behind its origin. */
  private butt = 0.3;

  constructor(assets: RigAssets) {
    this.assets = assets;
    // The meshes point their muzzles down +Z, the way a soldier holds them.
    // The camera looks down -Z, so the whole hold turns to face away from it.
    this.hold.rotation.y = Math.PI;
    this.hold.scale.setScalar(VIEW_SCALE);
    this.weapon = new THREE.Mesh(assets.rifle, assets.material);
    this.hands = new THREE.Mesh(assets.rifle, assets.material);
    // Nothing at the camera should cast into the scene it is looking at.
    for (const m of [this.weapon, this.hands]) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.hold.add(this.weapon, this.hands);
    this.root.add(this.hold);
    this.root.visible = false;
  }

  private handsFor(nation: string, weaponId: string) {
    const key = `${nation}:${weaponId}`;
    let geo = this.handsCache.get(key);
    if (!geo) {
      geo = viewHandsGeometry(nation, weaponId);
      this.handsCache.set(key, geo);
    }
    return geo;
  }

  /**
   * @param fov       the camera's current vertical FOV, in degrees
   * @param baseFov   the FOV the poses below were laid out at
   */
  update(s: Soldier, nation: string, zoomed: boolean, fov: number, baseFov: number, dt: number, now: number) {
    this.root.visible = true;

    if (s.weapon !== this.weaponId || nation !== this.nation) {
      this.weaponId = s.weapon;
      this.nation = nation;
      const geo = this.assets.weaponGeometryFor(s.weapon);
      this.weapon.geometry = geo;
      this.hands.geometry = this.handsFor(nation, s.weapon);
      // Weapon meshes are centred on the receiver, so half the length sits
      // behind the origin — hung straight off the camera that half is behind
      // the eye, and a rifle reads as a plank sliced by the near plane. Seat
      // the butt of the stock at the origin instead and let the length run
      // away from the eye, whatever the weapon: a bazooka and a pistol have
      // wildly different amounts of themselves behind the grip.
      geo.computeBoundingBox();
      this.butt = geo.boundingBox ? -geo.boundingBox.min.z : 0.3;
    }

    // A shot is visible as the muzzle-flash timer being refreshed. Drive the
    // kick as a spring so it snaps back rather than sliding.
    if (s.flash > this.lastFlash) this.kickVel += 2.6;
    this.lastFlash = s.flash;
    this.kickVel += (-this.kick * 190 - this.kickVel * 21) * dt;
    this.kick += this.kickVel * dt;

    const reloading = now < s.reloadUntil;
    const wantAds = zoomed && !s.sprinting && !reloading;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 13);

    const moving = Math.hypot(s.vel.x, s.vel.z) > 0.5;
    this.sway += dt * (s.sprinting ? 9 : 6);
    const bob = moving ? (s.sprinting ? 0.03 : 0.014) : 0.003;
    const bobX = Math.sin(this.sway) * bob;
    const bobY = Math.abs(Math.cos(this.sway)) * bob * 0.8;

    // Hip and sighted poses, blended. Sighted brings the weapon to the centre
    // of the screen and tucks it in; the hip pose holds it low and to the right.
    const x = lerp(0.185, 0.0, this.ads) + bobX * (1 - this.ads * 0.75);
    const y = lerp(-0.2, -0.05, this.ads) + bobY * (1 - this.ads * 0.75);
    const z = lerp(-0.16, -0.12, this.ads) + this.kick * 0.1;

    // Sprinting carries the weapon across the body, muzzle up and out of the
    // way; reloading drops it out of the sight line.
    const sprint = s.sprinting ? 1 : 0;
    const reload = reloading ? 1 : 0;
    const dip = sprint * 0.1 + reload * 0.13;

    // Keep the on-screen size constant as the FOV narrows for the sights.
    // Moving the weapon further out is not enough on its own: a rifle is a
    // metre long, so translating its butt away barely shrinks its muzzle.
    // Scaling by the same ratio as well makes it a true dolly about the eye,
    // which projects to exactly the same pixels at any FOV.
    // Sighted, the eye goes behind the rear sight, so the weapon slides back
    // along its own axis until most of the stock is behind the near plane and
    // clipped away. Without this the receiver sits in front of the eye and
    // fills the bottom of the screen exactly where the target is.
    const seat = this.butt - this.ads * (this.butt * 0.86);
    this.weapon.position.z = seat;
    this.hands.position.z = seat;
    this.hands.visible = this.ads < 0.6;

    const k = Math.tan((baseFov * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
    this.hold.scale.setScalar(VIEW_SCALE * k);
    this.root.position.set(x * k, (y - dip) * k, z * k);
    this.root.rotation.set(
      -this.kick * 0.5 + sprint * -0.22 + reload * -0.34,
      lerp(0.085, 0, this.ads) + sprint * 0.5,
      sprint * 0.55 + reload * 0.2,
    );
  }

  hide() {
    this.root.visible = false;
  }

  dispose() {
    for (const g of this.handsCache.values()) g.dispose();
    this.handsCache.clear();
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
    if (hasBarrel(def)) {
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
