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
  type Stance,
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

/* ---------------- ragdoll ---------------- */

/**
 * A five-point verlet ragdoll: head, chest, hips and two feet, held together
 * by distance constraints.
 *
 * Deliberately visual only. The simulation keeps treating a dead soldier as a
 * point at `s.pos`, so nothing about hit detection, AI or scoring depends on
 * where the body ends up — the ragdoll just decides what that death looks
 * like. Verlet rather than a real solver because the whole thing is five
 * points and seven constraints per corpse, and it never needs to be right,
 * only plausible.
 *
 * Everything runs in the rig's local frame, which is the soldier's position
 * and heading, so gravity is simply -Y and the ground is the plane y = 0.
 */
class Ragdoll {
  /** head, chest, hips, left foot, right foot. */
  private pos: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private links: { a: number; b: number; len: number; stiff: number }[] = [];
  /** Seconds of simulation left; a settled body stops costing anything. */
  private life = 6;

  /** Shove a settled body — a blast landing nearby, or a vehicle over it. */
  push(world: THREE.Vector3, yaw: number, strength: number) {
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const lx = world.x * cos - world.z * sin;
    const lz = world.x * sin + world.z * cos;
    for (let i = 0; i < this.pos.length; i++) {
      const share = strength * (i < 2 ? 0.05 : 0.03);
      this.prev[i].x -= lx * share;
      this.prev[i].y -= world.y * share * 0.6;
      this.prev[i].z -= lz * share;
    }
    // Whatever it was, the body is moving again and worth simulating.
    this.life = Math.max(this.life, 2.5);
  }

  constructor(stance: Stance, impulse: THREE.Vector3 | null, yaw: number) {
    // Seeded from roughly where the body was standing, so it falls from the
    // pose it was in rather than snapping to attention first.
    const hipY = stance === "stand" ? 0.9 : stance === "crouch" ? 0.62 : 0.3;
    const lean = stance === "prone" ? 0.75 : 0;
    const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.pos = [
      p(0, hipY + 0.78 - lean * 0.5, lean),
      p(0, hipY + 0.45 - lean * 0.3, lean * 0.6),
      p(0, hipY, 0),
      p(-0.17, 0.06, -0.05),
      p(0.17, 0.06, 0.05),
      // Hands, hanging off the chest. Without them the whole upper body is one
      // rigid piece and a fallen man reads as a plank rather than a body.
      p(-0.3, hipY + 0.3, 0.16),
      p(0.3, hipY + 0.3, 0.16),
    ];
    this.prev = this.pos.map((v) => v.clone());

    const link = (a: number, b: number, stiff = 1) =>
      this.links.push({ a, b, len: this.pos[a].distanceTo(this.pos[b]), stiff });
    link(0, 1);            // neck
    link(1, 2);            // spine
    link(2, 3);            // left leg
    link(2, 4);            // right leg
    link(1, 3, 0.35);      // chest to feet, loose, so the body keeps its length
    link(1, 4, 0.35);
    link(3, 4, 0.25);      // feet apart
    link(1, 5, 0.8);       // arms, slack enough to swing and flop
    link(1, 6, 0.8);
    link(2, 5, 0.12);      // and loosely tethered to the hips so they trail

    if (impulse) {
      // The impulse arrives in world space; the rig's frame is turned by the
      // soldier's heading, so it has to be turned back to match.
      const cos = Math.cos(-yaw);
      const sin = Math.sin(-yaw);
      const lx = impulse.x * cos - impulse.z * sin;
      const lz = impulse.x * sin + impulse.z * cos;
      // Upper body takes most of it — that is what makes a hit read as a hit
      // rather than the whole man sliding sideways.
      const share = [0.06, 0.05, 0.03, 0.012, 0.012, 0.045, 0.045];
      for (let i = 0; i < this.pos.length; i++) {
        this.prev[i].x -= lx * share[i];
        this.prev[i].y -= impulse.y * share[i] * 0.5;
        this.prev[i].z -= lz * share[i];
      }
    }
  }

  step(dt: number) {
    if (this.life <= 0) return;
    this.life -= dt;
    // Fixed sub-steps: verlet with a variable timestep changes stiffness as
    // the frame rate moves, and a corpse that behaves differently at 30 and
    // 120 fps is worse than one that is slightly behind.
    const steps = Math.min(3, Math.max(1, Math.round(dt / 0.016)));
    const h = Math.min(0.033, dt) / steps;
    for (let n = 0; n < steps; n++) this.substep(h);
  }

  private substep(h: number) {
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      const q = this.prev[i];
      const vx = (p.x - q.x) * 0.985;
      const vy = (p.y - q.y) * 0.985;
      const vz = (p.z - q.z) * 0.985;
      q.copy(p);
      p.x += vx;
      p.y += vy - 9.81 * h * h * 60;
      p.z += vz;
    }
    // Relax the constraints a few times; more passes make a stiffer body.
    for (let pass = 0; pass < 4; pass++) {
      for (const l of this.links) {
        const a = this.pos[l.a];
        const b = this.pos[l.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-4;
        const k = ((d - l.len) / d) * 0.5 * l.stiff;
        a.x += dx * k; a.y += dy * k; a.z += dz * k;
        b.x -= dx * k; b.y -= dy * k; b.z -= dz * k;
      }
      // Ground, with friction so a body does not skate once it lands.
      for (let i = 0; i < this.pos.length; i++) {
        const p = this.pos[i];
        const floor = i === 0 ? 0.16 : i === 1 ? 0.2 : 0.1;
        if (p.y >= floor) continue;
        p.y = floor;
        const q = this.prev[i];
        q.x += (p.x - q.x) * 0.55;
        q.z += (p.z - q.z) * 0.55;
        q.y = p.y;
      }
    }
  }

  /** Drive the rig's nodes from the simulated points. */
  apply(body: THREE.Group, torso: THREE.Group, armsPivot: THREE.Group, legs: THREE.Mesh[]) {
    const hips = this.pos[2];
    const chest = this.pos[1];
    body.position.set(hips.x, hips.y, hips.z);

    // The body's own +Y runs hips-to-chest, which is all the orientation a
    // shape this simple needs: lying, slumped and kneeling all fall out of it.
    _spine.subVectors(chest, hips).normalize();
    _q.setFromUnitVectors(_yAxis, _spine);
    body.quaternion.copy(_q);
    torso.rotation.set(0, 0, 0);

    // The arms hang towards where the hands ended up, averaged into the one
    // pivot the rig actually has for them.
    _leg.subVectors(this.pos[5], chest).add(_arm.subVectors(this.pos[6], chest)).multiplyScalar(0.5);
    _inv.copy(_q).invert();
    _leg.applyQuaternion(_inv);
    armsPivot.rotation.set(Math.atan2(_leg.z, -_leg.y) * 0.8, 0, 0);

    // Each leg swings towards where its foot ended up, measured in the body's
    // own frame so it stays correct however the torso came to rest.
    _inv.copy(_q).invert();
    for (let i = 0; i < 2; i++) {
      _leg.subVectors(this.pos[3 + i], hips).applyQuaternion(_inv);
      legs[i].rotation.x = Math.atan2(_leg.z, -_leg.y);
      legs[i].rotation.z = Math.atan2(-_leg.x - (i === 0 ? -0.16 : 0.16), -_leg.y) * 0.6;
    }
  }
}

const _spine = new THREE.Vector3();
const _leg = new THREE.Vector3();
const _arm = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _inv = new THREE.Quaternion();

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
  /** Non-null only while this soldier is dead; discarded on respawn. */
  private ragdoll: Ragdoll | null = null;
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

  update(s: Soldier, showMarker: boolean, hidden: boolean, dt = 0) {
    this.root.visible = !hidden;
    if (hidden) return;
    this.root.position.copy(s.pos);
    this.root.rotation.y = s.yaw;
    this.marker.visible = showMarker && s.alive;

    if (!s.alive) {
      // Fallen. The ragdoll is built the first frame the soldier is dead, from
      // the stance he was in and whatever the killing shot pushed him with, and
      // then simulated until it settles.
      if (!this.ragdoll) this.ragdoll = new Ragdoll(s.stance, s.deathImpulse, s.yaw);
      this.ragdoll.step(dt);
      this.ragdoll.apply(this.body, this.torso, this.armsPivot, this.legs);
      this.weapon.visible = false;
      return;
    }
    // Back on his feet: the old body is finished with.
    if (this.ragdoll) {
      this.ragdoll = null;
      this.body.quaternion.identity();
      for (const leg of this.legs) leg.rotation.set(0, 0, 0);
    }

    this.body.rotation.x = s.stance === "prone" ? Math.PI / 2 : 0;

    const hipY = s.stance === "stand" ? 0.9 : s.stance === "crouch" ? 0.62 : 0.3;

    // Legs swing on the gait phase when moving, and settle when still. A run
    // is a longer stride at a faster cadence, not just the walk played quicker,
    // so both the rate and the amplitude go up — which is most of what makes a
    // sprinting soldier read as sprinting from behind.
    const moving = Math.hypot(s.vel.x, s.vel.z) > 0.4;
    const cadence = s.sprinting ? 3.5 : 2.4;
    const swing = moving ? Math.sin(s.gait * cadence) * (s.sprinting ? 1.15 : 0.55) : 0;
    const bend = s.stance === "crouch" ? 0.85 : 0;
    this.legs[0].rotation.x = swing + bend;
    this.legs[1].rotation.x = -swing + bend;
    // The body rises and falls on each stride, hardest at a run.
    this.body.position.y = hipY + (moving ? Math.abs(Math.sin(s.gait * cadence)) * (s.sprinting ? 0.07 : 0.025) : 0);

    // Upper body twists towards where the soldier is looking, and leans into
    // a run. A man sprinting upright looks like a man on a travelator.
    this.torso.rotation.y = wrap(s.aimYaw - s.yaw);
    const lean = s.sprinting ? 0.34 : 0;
    this.torso.rotation.x = s.stance === "prone" ? -Math.PI / 2 + 0.25 : lean;
    this.armsPivot.rotation.x =
      (s.sprinting ? -0.5 + Math.sin(s.gait * cadence) * 0.45 : -s.aimPitch) +
      (moving && !s.sprinting ? Math.sin(s.gait * 4.8) * 0.05 : 0);
    // Sprinting soldiers carry the weapon low and across the body, and their
    // arms pump with the stride rather than holding the aim.
    this.armsPivot.rotation.z = s.sprinting ? -0.7 : 0;

    // Each weapon has its own silhouette, so the mesh is swapped whenever the
    // soldier changes weapon rather than toggling between two fixed ones.
    this.weapon.visible = true;
    if (s.weapon !== this.weaponId) {
      this.weaponId = s.weapon;
      this.weapon.geometry = this.assets.weaponGeometryFor(s.weapon);
      this.weapon.position.set(...weaponGrip(s.weapon));
    }
  }

  /** Shove this soldier's body, if he has one lying about. */
  pushRagdoll(world: THREE.Vector3, yaw: number) {
    this.ragdoll?.push(world, yaw, 1);
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
