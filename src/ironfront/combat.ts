import * as THREE from "three";
import { rayBox, type Terrain } from "./terrain";
import type { Effects } from "./effects";
import type { Audio } from "./audio";
import {
  SHELLS,
  STANCE_EYE,
  TANK_HULL,
  TANK_GUN_Y,
  TANK_TURRET,
  WEAPONS,
  type ShellType,
  type Soldier,
  type Tank,
  type Team,
  type TankModule,
  type Unit,
  type WeaponId,
} from "./units";
import { armorOf } from "./matchConfig";

export type ProjectileKind = "bullet" | "shell" | "rocket" | "grenade" | "bomb";

export type Projectile = {
  id: number;
  kind: ProjectileKind;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  ownerId: number;
  team: Team;
  weapon: WeaponId;
  shell: ShellType | null;
  penetration: number;
  damage: number;
  blast: number;
  blastDamage: number;
  gravity: number;
  drag: number;
  life: number;
  fuse: number;
  tracerColor: number;
  showTracer: boolean;
  /** Distance flown, for penetration falloff. */
  travelled: number;
  dead: boolean;
};

export type HitResult =
  | "penetration"
  | "ricochet"
  | "no-penetration"
  | "kill"
  | "hit"
  | "headshot"
  | "miss";

export type DamageInfo = {
  weapon: WeaponId;
  result: HitResult;
  module?: TankModule;
  /** Where the round landed, for effects and the hit indicator. */
  point: THREE.Vector3;
  /** Armour numbers, so the HUD can explain a bounce the way a sim would. */
  armor?: number;
  effective?: number;
  penetration?: number;
};

export interface CombatWorld {
  terrain: Terrain;
  effects: Effects;
  audio: Audio;
  now: number;
  allUnits(): Unit[];
  unitById(id: number): Unit | undefined;
  listener: THREE.Vector3;
  applyDamage(target: Unit, amount: number, attackerId: number, info: DamageInfo): void;
  notify(attackerId: number, targetId: number, info: DamageInfo): void;
}

/** Height and width of a soldier's hitbox in each stance. */
const SOLDIER_BOX = {
  stand: { hw: 0.32, hh: 0.9, hd: 0.26, y: 0.9, headY: 1.68 },
  crouch: { hw: 0.34, hh: 0.62, hd: 0.34, y: 0.62, headY: 1.14 },
  prone: { hw: 0.34, hh: 0.28, hd: 0.95, y: 0.28, headY: 0.46 },
};

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

export class Battle {
  readonly projectiles: Projectile[] = [];
  private nextId = 1;
  private tracerCounter = 0;

  constructor(private world: CombatWorld) {}

  /**
   * Launch a round. `dir` is expected normalised; `spread` is added as a random
   * cone so a rifle at 300 m is a suggestion rather than a promise.
   */
  fire(opts: {
    kind: ProjectileKind;
    weapon: WeaponId;
    from: THREE.Vector3;
    dir: THREE.Vector3;
    ownerId: number;
    team: Team;
    shell?: ShellType;
    spread?: number;
    speedScale?: number;
    inheritVel?: THREE.Vector3;
  }) {
    const spec = WEAPONS[opts.weapon];
    const shell = opts.shell ?? null;
    const sh = shell ? SHELLS[shell] : null;
    _dir.copy(opts.dir).normalize();
    const spread = opts.spread ?? spec.spread;
    if (spread > 0) {
      _tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      _dir.addScaledVector(_tmp, spread * (Math.random() + Math.random()) * 0.5).normalize();
    }
    const speed = spec.speed * (opts.speedScale ?? 1);
    const vel = _dir.clone().multiplyScalar(speed);
    if (opts.inheritVel) vel.add(opts.inheritVel);

    const p: Projectile = {
      id: this.nextId++,
      kind: opts.kind,
      pos: opts.from.clone(),
      prev: opts.from.clone(),
      vel,
      ownerId: opts.ownerId,
      team: opts.team,
      weapon: opts.weapon,
      shell,
      penetration: sh ? sh.penetration : spec.penetration,
      damage: sh ? sh.damage : spec.damage,
      blast: sh ? sh.blast : spec.blast,
      blastDamage: sh ? sh.blastDamage : spec.blastDamage,
      gravity: opts.kind === "bullet" ? 9.81 : opts.kind === "grenade" ? 18 : 9.81,
      drag: opts.kind === "bullet" ? 0.09 : opts.kind === "shell" ? 0.035 : 0.02,
      life: opts.kind === "grenade" ? 3.4 : opts.kind === "bullet" ? 3 : 12,
      fuse: opts.kind === "grenade" ? 3.4 : 0,
      tracerColor: spec.tracer,
      showTracer: opts.kind !== "grenade" && opts.kind !== "bomb" && this.tracerCounter++ % 2 === 0,
      travelled: 0,
      dead: false,
    };
    if (opts.kind === "shell" || opts.kind === "rocket") p.showTracer = true;
    this.projectiles.push(p);
    this.report(opts.weapon, opts.from, _dir);
    return p;
  }

  /** Muzzle flash and report, in one place so every shooter sounds the same. */
  private report(weapon: WeaponId, from: THREE.Vector3, dir: THREE.Vector3) {
    const dist = from.distanceTo(this.world.listener);
    switch (weapon) {
      case "cannon":
      case "sixpdr":
      case "maxim57":
      case "field_75":
      case "howitzer_155":
        this.world.effects.muzzleFlash(from, dir, 1.5);
        this.world.audio.cannon(dist);
        break;
      case "launcher":
        this.world.effects.muzzleFlash(from, dir, 1.0);
        this.world.audio.cannon(dist * 1.5);
        break;
      case "rifle":
      case "coax":
      case "vickers_mg":
      case "air_mg":
      case "aircannon":
        this.world.effects.muzzleFlash(from, dir, weapon === "rifle" ? 0.4 : 0.5);
        this.world.audio.rifle(dist);
        break;
      default:
        break;
    }
  }

  update(dt: number) {
    const { effects } = this.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      this.step(p, dt);
      if (p.dead || p.life <= 0) {
        if (!p.dead && p.blast > 0) this.detonate(p, p.pos);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.showTracer) {
        const len = p.kind === "bullet" ? 6 : p.kind === "shell" ? 4 : 2.5;
        _tmp.copy(p.vel).normalize().multiplyScalar(-len).add(p.pos);
        effects.tracer(_tmp, p.pos, p.tracerColor);
      }
    }
  }

  /** Integrate one projectile, sweeping the path for hits as it goes. */
  private step(p: Projectile, dt: number) {
    p.life -= dt;
    if (p.fuse > 0) {
      p.fuse -= dt;
      if (p.fuse <= 0) {
        this.detonate(p, p.pos);
        p.dead = true;
        return;
      }
    }

    const speed = p.vel.length();
    const total = speed * dt;
    // Sub-step so a 480 m/s round cannot skip a soldier at 60 fps.
    const steps = Math.min(8, Math.max(1, Math.ceil(total / 2.5)));
    const sdt = dt / steps;

    for (let s = 0; s < steps; s++) {
      p.prev.copy(p.pos);
      p.vel.y -= p.gravity * sdt;
      const k = 1 - p.drag * sdt;
      p.vel.multiplyScalar(k);
      p.pos.addScaledVector(p.vel, sdt);
      p.travelled += p.vel.length() * sdt;

      _seg.subVectors(p.pos, p.prev);
      const segLen = _seg.length();
      if (segLen < 1e-5) continue;
      _dir.copy(_seg).divideScalar(segLen);

      this.snapNear(p);

      const hit = this.castSegment(p, p.prev, _dir, segLen);
      if (hit) return;

      // Ground.
      const ground = this.world.terrain.heightAt(p.pos.x, p.pos.z);
      if (p.pos.y <= ground) {
        _hitPoint.set(p.pos.x, ground, p.pos.z);
        if (p.kind === "grenade" && p.fuse > 0.15) {
          // Grenades bounce rather than stick.
          p.pos.copy(_hitPoint);
          const n = this.world.terrain.normalAt(p.pos.x, p.pos.z, _tmp2);
          p.vel.reflect(n).multiplyScalar(0.36);
          p.pos.y += 0.06;
          continue;
        }
        this.impact(p, _hitPoint, this.world.terrain.normalAt(_hitPoint.x, _hitPoint.z, _tmp2), "dirt");
        p.dead = true;
        return;
      }

      if (Math.abs(p.pos.x) > 360 || Math.abs(p.pos.z) > 360 || p.pos.y > 900) {
        p.dead = true;
        return;
      }
    }
  }

  /** Play a supersonic crack if the round goes past the player's head. */
  private snapNear(p: Projectile) {
    if (p.kind !== "bullet" || p.ownerId === -1) return;
    const d = p.pos.distanceTo(this.world.listener);
    if (d < 6) this.world.audio.snap(d);
  }

  /**
   * Sweep a segment against every unit and building. Returns true if the round
   * was consumed.
   */
  private castSegment(p: Projectile, from: THREE.Vector3, dir: THREE.Vector3, len: number) {
    let bestT = len;
    let bestUnit: Unit | null = null;
    let bestNormal: THREE.Vector3 | null = null;
    let bestPart: "hull" | "turret" | "head" | "body" | null = null;

    for (const u of this.world.allUnits()) {
      if (!u.alive) continue;
      if (u.id === p.ownerId) continue;
      if (u.team === p.team && p.kind !== "grenade") continue;
      if (u.kind === "soldier") {
        if (u.ridingId !== null) continue;
        const box = SOLDIER_BOX[u.stance];
        const yaw = u.stance === "prone" ? u.yaw : 0;
        const hitHead = rayBox(from, dir, u.pos.x, u.pos.y + box.headY, u.pos.z, 0.16, 0.16, 0.16, yaw, bestT);
        if (hitHead && hitHead.t < bestT) {
          bestT = hitHead.t;
          bestUnit = u;
          bestNormal = hitHead.normal;
          bestPart = "head";
        }
        const hitBody = rayBox(from, dir, u.pos.x, u.pos.y + box.y, u.pos.z, box.hw, box.hh, box.hd, yaw, bestT);
        if (hitBody && hitBody.t < bestT) {
          bestT = hitBody.t;
          bestUnit = u;
          bestNormal = hitBody.normal;
          bestPart = "body";
        }
      } else if (u.kind === "tank") {
        const hull = rayBox(
          from, dir,
          u.pos.x, u.pos.y + TANK_HULL.y, u.pos.z,
          TANK_HULL.hw, TANK_HULL.hh, TANK_HULL.hd, u.yaw, bestT,
        );
        if (hull && hull.t < bestT) {
          bestT = hull.t;
          bestUnit = u;
          bestNormal = hull.normal;
          bestPart = "hull";
        }
        const tz = TANK_TURRET.z;
        const tx = u.pos.x + Math.sin(u.yaw) * tz;
        const tzz = u.pos.z + Math.cos(u.yaw) * tz;
        const turret = rayBox(
          from, dir,
          tx, u.pos.y + TANK_TURRET.y, tzz,
          TANK_TURRET.hw, TANK_TURRET.hh, TANK_TURRET.hd, u.yaw + u.turret, bestT,
        );
        if (turret && turret.t < bestT) {
          bestT = turret.t;
          bestUnit = u;
          bestNormal = turret.normal;
          bestPart = "turret";
        }
      } else {
        // Aircraft use a sphere: precise enough at the speeds involved.
        const t = raySphere(from, dir, u.pos, 3.4, bestT);
        if (t !== null && t < bestT) {
          bestT = t;
          bestUnit = u;
          bestNormal = _tmp2.copy(from).addScaledVector(dir, t).sub(u.pos).normalize().clone();
          bestPart = "hull";
        }
      }
    }

    const wall = this.world.terrain.rayObstacle(from, dir, bestT);
    if (wall) {
      _hitPoint.copy(from).addScaledVector(dir, wall.t);
      this.impact(p, _hitPoint, wall.normal, wall.obstacle.solidToVehicles ? "stone" : "dirt");
      p.dead = true;
      return true;
    }

    if (!bestUnit || !bestNormal || !bestPart) return false;
    _hitPoint.copy(from).addScaledVector(dir, bestT);
    this.resolveUnitHit(p, bestUnit, bestPart, _hitPoint, bestNormal, dir);
    return p.dead;
  }

  private resolveUnitHit(
    p: Projectile,
    target: Unit,
    part: "hull" | "turret" | "head" | "body",
    point: THREE.Vector3,
    normal: THREE.Vector3,
    dir: THREE.Vector3,
  ) {
    if (target.kind === "soldier") {
      const headshot = part === "head";
      const damage = headshot ? Math.max(100, p.damage * 2.6) : p.damage;
      if (p.blast > 0) {
        this.detonate(p, point);
        p.dead = true;
        return;
      }
      this.world.effects.impact(point, normal, "flesh");
      this.world.applyDamage(target, damage, p.ownerId, {
        weapon: p.weapon,
        result: headshot ? "headshot" : "hit",
        point: point.clone(),
      });
      p.dead = true;
      return;
    }

    if (target.kind === "plane") {
      this.world.effects.impact(point, normal, "metal");
      const dmg = p.blast > 0 ? p.damage + p.blastDamage * 0.4 : p.damage;
      this.world.applyDamage(target, dmg, p.ownerId, {
        weapon: p.weapon,
        result: "hit",
        point: point.clone(),
      });
      if (p.blast > 0) this.detonate(p, point);
      p.dead = true;
      return;
    }

    this.resolveArmor(p, target, part === "turret" ? "turret" : "hull", point, normal, dir);
  }

  /**
   * The heart of it: thickness over the cosine of the impact angle, compared
   * against the round's remaining penetration. Steeply angled plates bounce
   * shot that would sail straight through them square on.
   */
  private resolveArmor(
    p: Projectile,
    tank: Tank,
    part: "hull" | "turret",
    point: THREE.Vector3,
    normal: THREE.Vector3,
    dir: THREE.Vector3,
  ) {
    const facing = part === "hull" ? tank.yaw : tank.yaw + tank.turret;
    const local = worldToLocalDir(normal, facing);
    // Plate thickness comes from this vehicle's own scheme, so the same shot
    // that punches a Greyhound's flank glances off a Tiger's.
    const scheme = armorOf(tank.defId);
    let armor: number;
    if (Math.abs(local.y) > 0.6) {
      armor = part === "hull" ? scheme.hullTop : scheme.turretTop;
    } else if (Math.abs(local.z) > Math.abs(local.x)) {
      if (local.z > 0) armor = part === "hull" ? scheme.hullFront : scheme.turretFront;
      else armor = part === "hull" ? scheme.hullRear : scheme.turretRear;
    } else {
      armor = part === "hull" ? scheme.hullSide : scheme.turretSide;
    }

    // Impact angle from the plate normal.
    const cos = Math.max(0.08, -dir.dot(normal));
    const angle = Math.acos(Math.min(1, cos));
    const effective = armor / cos;
    // Penetration bleeds off with range, the way real shot does.
    const pen = p.penetration * Math.max(0.55, 1 - p.travelled / 900);

    const ricochet = angle > 1.22 && pen < effective * 1.6 && p.kind !== "rocket";
    const dist = point.distanceTo(this.world.listener);

    if (ricochet) {
      this.world.effects.impact(point, normal, "metal");
      this.world.audio.ricochet(dist);
      this.world.notify(p.ownerId, tank.id, {
        weapon: p.weapon,
        result: "ricochet",
        point: point.clone(),
        armor,
        effective,
        penetration: pen,
      });
      // The round skips off and keeps flying, slower and deflected.
      p.vel.reflect(normal).multiplyScalar(0.55);
      p.pos.copy(point).addScaledVector(normal, 0.3);
      p.penetration *= 0.5;
      return;
    }

    if (pen < effective) {
      this.world.effects.impact(point, normal, "metal");
      this.world.audio.ricochet(dist);
      // HE still rattles the crew even when the plate holds.
      if (p.blast > 0) {
        this.detonate(p, point);
        this.world.applyDamage(tank, p.blastDamage * 0.12, p.ownerId, {
          weapon: p.weapon,
          result: "no-penetration",
          point: point.clone(),
          armor,
          effective,
          penetration: pen,
        });
      }
      this.world.notify(p.ownerId, tank.id, {
        weapon: p.weapon,
        result: "no-penetration",
        point: point.clone(),
        armor,
        effective,
        penetration: pen,
      });
      p.dead = true;
      return;
    }

    // Through the plate. Something inside gets broken.
    const overmatch = Math.min(2.2, pen / effective);
    const module = this.rollModule(part, p);
    let damage = p.damage * (0.5 + overmatch * 0.4);
    if (p.blast > 0) damage += p.blastDamage * 0.3;
    if (module === "ammo" && Math.random() < 0.45 + overmatch * 0.2) damage = 999;

    this.world.effects.impact(point, normal, "metal");
    this.world.effects.burst(point, 10, 9, {
      color: 0xffcf7a,
      size: 0.2,
      life: 0.5,
      drag: 0.4,
      gravity: 8,
    }, _tmp.copy(dir).negate(), 0.6);
    this.world.audio.penetration(dist);

    this.world.applyDamage(tank, damage, p.ownerId, {
      weapon: p.weapon,
      result: "penetration",
      module,
      point: point.clone(),
      armor,
      effective,
      penetration: pen,
    });
    p.dead = true;
  }

  private rollModule(part: "hull" | "turret", p: Projectile): TankModule {
    const r = Math.random();
    if (part === "turret") {
      if (r < 0.4) return "gunner";
      if (r < 0.7) return "ammo";
      return "engine";
    }
    if (r < 0.24) return "tracks";
    if (r < 0.48) return "engine";
    if (r < 0.7) return "driver";
    if (r < 0.88) return "ammo";
    return "gunner";
  }

  private impact(p: Projectile, point: THREE.Vector3, normal: THREE.Vector3, surface: "dirt" | "stone") {
    if (p.blast > 0) {
      this.detonate(p, point);
      return;
    }
    this.world.effects.impact(point, normal, surface);
    const d = point.distanceTo(this.world.listener);
    if (d < 90 && Math.random() < 0.3) this.world.audio.ricochet(d);
  }

  /** Blast: damage everything in radius, softened by cover and distance. */
  detonate(p: Projectile, at: THREE.Vector3) {
    if (p.dead && p.blast <= 0) return;
    p.dead = true;
    const radius = p.blast;
    if (radius <= 0) return;
    this.world.effects.explosion(at, radius);
    this.world.audio.explosion(at.distanceTo(this.world.listener), Math.max(0.6, radius / 8));

    for (const u of this.world.allUnits()) {
      if (!u.alive) continue;
      if (u.kind === "soldier" && u.ridingId !== null) continue;
      const centre = u.kind === "soldier" ? _tmp.set(u.pos.x, u.pos.y + STANCE_EYE[u.stance] * 0.5, u.pos.z) : _tmp.copy(u.pos);
      if (u.kind === "tank") centre.y += TANK_HULL.y;
      const d = centre.distanceTo(at);
      if (d > radius * 1.6) continue;
      const falloff = Math.max(0, 1 - d / (radius * 1.6));
      let damage = p.blastDamage * falloff * falloff;
      if (u.kind === "tank") {
        // Splinters do nothing to armour; only real explosive charges tell.
        const topArmor = armorOf(u.defId).hullTop;
        if (p.penetration < topArmor * 0.6) damage = 0;
        else damage *= 0.6;
      }
      if (damage <= 0.5) continue;
      // Walls between the charge and the target soak most of it.
      if (this.world.terrain.losBlocked(at, centre)) damage *= 0.35;
      this.world.applyDamage(u, damage, p.ownerId, {
        weapon: p.weapon,
        result: "hit",
        point: at.clone(),
      });
      if (u.kind === "soldier" && u.ai) u.ai.coverUntil = this.world.now + 2.5;
    }
  }

  /** Suppression: rounds cracking past make AI keep their heads down. */
  suppressNear(point: THREE.Vector3, team: Team, radius: number, amount: number) {
    for (const u of this.world.allUnits()) {
      if (u.kind !== "soldier" || !u.alive || u.team === team) continue;
      if (u.pos.distanceTo(point) < radius) u.suppression = Math.min(100, u.suppression + amount);
    }
  }

  clear() {
    this.projectiles.length = 0;
  }
}

function worldToLocalDir(v: THREE.Vector3, yaw: number) {
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  return _tmp2.set(v.x * c - v.z * s, v.y, v.x * s + v.z * c);
}

function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, centre: THREE.Vector3, radius: number, maxT: number) {
  const ox = origin.x - centre.x;
  const oy = origin.y - centre.y;
  const oz = origin.z - centre.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxT) return null;
  return t;
}

/** Where a soldier's muzzle sits, given stance and aim. Used by both AI and player. */
export function muzzleOf(s: Soldier, out = new THREE.Vector3()) {
  const eye = STANCE_EYE[s.stance];
  const cp = Math.cos(s.aimPitch);
  out.set(
    s.pos.x + Math.sin(s.aimYaw) * cp * 0.75,
    s.pos.y + eye - 0.1 + Math.sin(s.aimPitch) * 0.75,
    s.pos.z + Math.cos(s.aimYaw) * cp * 0.75,
  );
  return out;
}

/** Where a tank's gun muzzle sits in world space. */
export function tankMuzzle(t: Tank, out = new THREE.Vector3()) {
  const yaw = t.yaw + t.turret;
  const len = 4.0;
  const cp = Math.cos(t.barrel);
  const sx = Math.sin(t.yaw) * TANK_TURRET.z;
  const sz = Math.cos(t.yaw) * TANK_TURRET.z;
  out.set(
    t.pos.x + sx + Math.sin(yaw) * cp * len,
    t.pos.y + TANK_GUN_Y + Math.sin(t.barrel) * len,
    t.pos.z + sz + Math.cos(yaw) * cp * len,
  );
  return out;
}
