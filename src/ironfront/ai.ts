import * as THREE from "three";
import type { Terrain, Zone } from "./terrain";
import { Battle, muzzleOf, tankMuzzle } from "./combat";
import {
  BARREL_MAX,
  BARREL_MIN,
  PLANE_MAX_SPEED,
  STANCE_EYE,
  TANK_GUN_Y,
  TANK_MAX_SPEED,
  TANK_TURRET,
  TURRET_TRAVERSE,
  WEAPONS,
  enemyOf,
  type Plane,
  type Soldier,
  type Tank,
  type Team,
  type Unit,
} from "./units";
import { angleDelta, approachAngle, clamp } from "./random";

/**
 * Squad and crew behaviour. Everything is a small state machine on a think
 * timer: work out who to shoot every half second, then spend the frames in
 * between walking, traversing and pulling triggers.
 */

export type AiContext = {
  terrain: Terrain;
  battle: Battle;
  now: number;
  units: Unit[];
  /** The point this team is currently being pushed towards. */
  objectiveFor: (team: Team) => Zone;
  /** 0 = harmless, 1 = unpleasant. Scales accuracy and reaction time. */
  skill: number;
};

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Centre of mass, which is where the AI actually aims. */
function aimPoint(u: Unit, out: THREE.Vector3) {
  if (u.kind === "soldier") return out.set(u.pos.x, u.pos.y + STANCE_EYE[u.stance] * 0.62, u.pos.z);
  if (u.kind === "tank") return out.set(u.pos.x, u.pos.y + 1.5, u.pos.z);
  return out.copy(u.pos);
}

function velocityOf(u: Unit, out: THREE.Vector3) {
  if (u.kind === "soldier") return out.copy(u.vel);
  if (u.kind === "plane") return out.copy(u.vel);
  return out.set(Math.sin(u.yaw), 0, Math.cos(u.yaw)).multiplyScalar(u.speed);
}

/** Nearest live enemy within range, preferring the ones already in the open. */
function findTarget(self: Unit, ctx: AiContext, range: number, wantVehicles: boolean) {
  const foe = enemyOf(self.team);
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const u of ctx.units) {
    if (!u.alive || u.team !== foe) continue;
    if (u.kind === "soldier" && u.ridingId !== null) continue;
    if (u.kind === "plane" && self.kind !== "plane") continue;
    const d = self.pos.distanceTo(u.pos);
    if (d > range) continue;
    let score = d;
    if (wantVehicles && u.kind === "tank") score *= 0.55;
    if (!wantVehicles && u.kind === "soldier") score *= 0.75;
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

/**
 * Pick a heading that gets towards `goal` without walking into a wall. Probes a
 * fan of directions and takes the most open one that still makes progress.
 */
function steer(pos: THREE.Vector3, goalX: number, goalZ: number, terrain: Terrain, probe: number, vehicle: boolean) {
  const want = Math.atan2(goalX - pos.x, goalZ - pos.z);
  const offsets = [0, 0.35, -0.35, 0.8, -0.8, 1.4, -1.4, 2.2, -2.2];
  for (const o of offsets) {
    const yaw = want + o;
    const x = pos.x + Math.sin(yaw) * probe;
    const z = pos.z + Math.cos(yaw) * probe;
    if (Math.abs(x) > 330 || Math.abs(z) > 330) continue;
    if (terrain.inObstacle(x, terrain.heightAt(x, z) + 1, z, vehicle ? 2.4 : 0.7, vehicle)) continue;
    const rise = terrain.heightAt(x, z) - terrain.heightAt(pos.x, pos.z);
    if (vehicle && rise / probe > 0.75) continue;
    if (!vehicle && rise / probe > 1.4) continue;
    return yaw;
  }
  return want + Math.PI * 0.6;
}

/** A spot near cover, on the far side of it from the threat. */
function coverSpot(self: Unit, threat: THREE.Vector3, terrain: Terrain, out: THREE.Vector3) {
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  for (const o of terrain.obstacles) {
    const d = Math.hypot(o.x - self.pos.x, o.z - self.pos.z);
    if (d > 34 || d < 2) continue;
    const away = Math.atan2(o.x - threat.x, o.z - threat.z);
    const px = o.x + Math.sin(away) * (o.radius + 1.2);
    const pz = o.z + Math.cos(away) * (o.radius + 1.2);
    const dist = Math.hypot(px - self.pos.x, pz - self.pos.z);
    if (dist < bestD) {
      bestD = dist;
      best = out.set(px, terrain.heightAt(px, pz), pz);
    }
  }
  return best;
}

/* ---------------- infantry ---------------- */

export function updateSoldierAI(s: Soldier, ctx: AiContext, dt: number) {
  const ai = s.ai;
  if (!ai) return;
  const { terrain, now } = ctx;

  s.suppression = Math.max(0, s.suppression - dt * 22);

  if (now >= ai.nextThink) {
    ai.nextThink = now + 0.35 + Math.random() * 0.4;
    const zone = ctx.objectiveFor(s.team);
    ai.zoneId = zone.id;

    const target = findTarget(s, ctx, 190, false);
    ai.targetId = target ? target.id : null;

    if (!target) {
      ai.state = "advance";
      // Spread the squad out around the objective rather than stacking on it.
      const spread = 12 + Math.random() * 22;
      const ang = Math.random() * Math.PI * 2;
      ai.goal.set(zone.x + Math.cos(ang) * spread, 0, zone.z + Math.sin(ang) * spread);
      ai.strafe = 0;
    } else {
      const d = s.pos.distanceTo(target.pos);
      const scared = s.hp < 45 || s.suppression > 55 || (target.kind === "tank" && s.mags.launcher <= 0 && s.ammo.launcher <= 0);
      if (scared && now > ai.coverUntil) {
        ai.state = "cover";
        const spot = coverSpot(s, target.pos, terrain, _v);
        if (spot) ai.goal.copy(spot);
        else ai.goal.set(s.pos.x - (target.pos.x - s.pos.x) * 0.4, 0, s.pos.z - (target.pos.z - s.pos.z) * 0.4);
        ai.coverUntil = now + 3.5;
      } else {
        ai.state = "engage";
        ai.strafe = Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        // Close to a useful range, then hold and shoot.
        const want = target.kind === "tank" ? 55 : 45;
        if (d > want * 1.6) {
          ai.goal.set(target.pos.x, 0, target.pos.z);
        } else {
          ai.goal.copy(s.pos);
        }
      }
      // Pull out the launcher for armour, put it away for people.
      const wantLauncher = target.kind === "tank" && d < 130 && (s.ammo.launcher > 0 || s.mags.launcher > 0);
      s.weapon = wantLauncher ? "launcher" : "rifle";
    }
  }

  const target = ai.targetId !== null ? ctx.units.find((u) => u.id === ai.targetId) : undefined;

  if (target && target.alive && now >= ai.nextLos) {
    ai.nextLos = now + 0.22 + Math.random() * 0.2;
    _v.set(s.pos.x, s.pos.y + STANCE_EYE[s.stance], s.pos.z);
    aimPoint(target, _aim);
    ai.hasLos = !terrain.losBlocked(_v, _aim);
  }
  if (!target || !target.alive) ai.hasLos = false;

  /* stance */
  if (ai.state === "cover" && s.pos.distanceTo(ai.goal) < 2.5) s.stance = s.suppression > 60 ? "prone" : "crouch";
  else if (ai.state === "engage" && ai.hasLos && s.pos.distanceTo(ai.goal) < 1.5) s.stance = "crouch";
  else s.stance = "stand";

  /* movement */
  const distToGoal = Math.hypot(ai.goal.x - s.pos.x, ai.goal.z - s.pos.z);
  let moveYaw = s.yaw;
  let moving = false;
  if (distToGoal > 2) {
    moveYaw = steer(s.pos, ai.goal.x, ai.goal.z, terrain, 3.2, false);
    moving = true;
  } else if (ai.strafe !== 0 && ai.hasLos) {
    moveYaw = s.aimYaw + (Math.PI / 2) * ai.strafe;
    moving = true;
  }
  s.sprinting = moving && ai.state === "advance" && distToGoal > 22 && s.stance === "stand";

  if (moving) {
    const speed = (s.stance === "stand" ? (s.sprinting ? 6.2 : 3.6) : s.stance === "crouch" ? 2.0 : 0.85);
    s.vel.x = Math.sin(moveYaw) * speed;
    s.vel.z = Math.cos(moveYaw) * speed;
    s.gait += dt * speed * 1.5;
  } else {
    s.vel.x *= 0.6;
    s.vel.z *= 0.6;
  }

  /* aiming and shooting */
  if (target && ai.hasLos) {
    aimPoint(target, _aim);
    const dist = s.pos.distanceTo(_aim);
    const spec = WEAPONS[s.weapon];
    // Lead the target and lift for drop, badly or well depending on skill.
    const flight = dist / spec.speed;
    velocityOf(target, _v).multiplyScalar(flight * (0.4 + ctx.skill * 0.6));
    _aim.add(_v);
    _aim.y += 0.5 * 9.81 * flight * flight * (0.5 + ctx.skill * 0.5);

    const wantYaw = Math.atan2(_aim.x - s.pos.x, _aim.z - s.pos.z);
    const flat = Math.hypot(_aim.x - s.pos.x, _aim.z - s.pos.z);
    const wantPitch = Math.atan2(_aim.y - (s.pos.y + STANCE_EYE[s.stance]), flat);
    const turn = dt * (3.2 + ctx.skill * 3);
    s.aimYaw = approachAngle(s.aimYaw, wantYaw, turn);
    s.aimPitch += clamp(wantPitch - s.aimPitch, -turn, turn);
    s.yaw = approachAngle(s.yaw, s.aimYaw, dt * 5);

    const aligned = Math.abs(angleDelta(s.aimYaw, wantYaw)) < 0.09;
    const inRange = dist < (s.weapon === "launcher" ? 140 : 175);
    if (aligned && inRange && now >= s.reloadUntil) {
      if (now >= ai.burstCooldown) {
        if (now >= ai.burstUntil) {
          ai.burstUntil = now + 0.25 + Math.random() * 0.5;
          ai.burstCooldown = ai.burstUntil + 0.35 + (1 - ctx.skill) * 1.2 + Math.random() * 0.5;
        }
        if (now < ai.burstUntil) fireSoldier(s, ctx, dist);
      }
    }
  } else {
    s.aimYaw = approachAngle(s.aimYaw, s.yaw, dt * 3);
    s.aimPitch += clamp(-s.aimPitch, -dt * 2, dt * 2);
    if (moving) s.yaw = approachAngle(s.yaw, moveYaw, dt * 4.5);
  }

  // Grenades, sparingly, at people sitting still in cover close by.
  if (target && s.grenades > 0 && !ai.hasLos && now > ai.burstCooldown && Math.random() < dt * 0.12) {
    const d = s.pos.distanceTo(target.pos);
    if (d > 12 && d < 34) {
      s.grenades--;
      muzzleOf(s, _muzzle);
      _dir.set(target.pos.x - s.pos.x, 0, target.pos.z - s.pos.z).normalize();
      _dir.y = 0.55;
      ctx.battle.fire({
        kind: "grenade",
        weapon: "grenade",
        from: _muzzle,
        dir: _dir,
        ownerId: s.id,
        team: s.team,
        speedScale: clamp(d / 22, 0.6, 1.5),
      });
      ai.burstCooldown = ctx.now + 3;
    }
  }
}

function fireSoldier(s: Soldier, ctx: AiContext, dist: number) {
  const spec = WEAPONS[s.weapon];
  if (ctx.now < s.nextShotAt) return;
  if (s.ammo[s.weapon] <= 0) {
    if (s.mags[s.weapon] > 0) {
      s.mags[s.weapon]--;
      s.ammo[s.weapon] = spec.magazine;
      s.reloadUntil = ctx.now + spec.reloadTime;
    } else if (s.weapon === "launcher") {
      s.weapon = "rifle";
    }
    return;
  }
  s.ammo[s.weapon]--;
  s.nextShotAt = ctx.now + 60 / spec.rpm;
  s.flash = 0.05;

  muzzleOf(s, _muzzle);
  const cp = Math.cos(s.aimPitch);
  _dir.set(Math.sin(s.aimYaw) * cp, Math.sin(s.aimPitch), Math.cos(s.aimYaw) * cp).normalize();
  // Bot dispersion: worse at range, worse when the shooter is rattled.
  const err = spec.spread * (2.6 - ctx.skill * 1.4) * (1 + dist / 260) * (1 + s.suppression / 90);
  ctx.battle.fire({
    kind: s.weapon === "launcher" ? "rocket" : "bullet",
    weapon: s.weapon,
    from: _muzzle,
    dir: _dir,
    ownerId: s.id,
    team: s.team,
    spread: err,
  });
  ctx.battle.suppressNear(_muzzle, s.team, 4, 6);
}

/* ---------------- armour ---------------- */

export function updateTankAI(t: Tank, ctx: AiContext, dt: number) {
  const ai = t.ai;
  if (!ai) return;
  const { terrain, now } = ctx;

  if (now >= ai.nextThink) {
    ai.nextThink = now + 0.4 + Math.random() * 0.3;
    const zone = ctx.objectiveFor(t.team);
    ai.zoneId = zone.id;
    const target = findTarget(t, ctx, 420, true);
    ai.targetId = target ? target.id : null;
    if (target && t.pos.distanceTo(target.pos) < 340) {
      ai.state = "engage";
      // Hold at a standoff: crews that keep driving into rifle range die.
      const d = t.pos.distanceTo(target.pos);
      if (d < 60) {
        ai.goal.set(
          t.pos.x - (target.pos.x - t.pos.x) * 0.5,
          0,
          t.pos.z - (target.pos.z - t.pos.z) * 0.5,
        );
      } else if (d > 220) {
        ai.goal.set(target.pos.x, 0, target.pos.z);
      } else {
        ai.goal.copy(t.pos);
      }
    } else {
      ai.state = "advance";
      const ang = Math.random() * Math.PI * 2;
      ai.goal.set(zone.x + Math.cos(ang) * 26, 0, zone.z + Math.sin(ang) * 26);
    }
    // Load for the job in hand.
    if (target) t.shell = target.kind === "tank" ? "ap" : "he";
  }

  const target = ai.targetId !== null ? ctx.units.find((u) => u.id === ai.targetId) : undefined;
  if (target && target.alive && now >= ai.nextLos) {
    ai.nextLos = now + 0.3;
    tankMuzzle(t, _v);
    aimPoint(target, _aim);
    ai.hasLos = !terrain.losBlocked(_v, _aim);
  }
  if (!target || !target.alive) ai.hasLos = false;

  /* driving */
  const trackHealth = t.modules.tracks / 100;
  const engineHealth = t.modules.engine / 100;
  const distToGoal = Math.hypot(ai.goal.x - t.pos.x, ai.goal.z - t.pos.z);

  // Stuck detection: if we have barely moved while trying to, back up.
  const moved = t.pos.distanceTo(ai.lastPos);
  ai.lastPos.copy(t.pos);
  if (distToGoal > 6 && moved < 0.03 * TANK_MAX_SPEED * 0.1) ai.stuckFor += dt;
  else ai.stuckFor = Math.max(0, ai.stuckFor - dt * 2);
  if (ai.stuckFor > 1.2 && now > ai.reverseUntil) {
    ai.reverseUntil = now + 1.6;
    ai.stuckFor = 0;
  }

  let throttle = 0;
  if (now < ai.reverseUntil) {
    throttle = -1;
    t.yaw += dt * 0.5;
  } else if (distToGoal > 6) {
    const want = steer(t.pos, ai.goal.x, ai.goal.z, terrain, 9, true);
    const delta = angleDelta(t.yaw, want);
    t.yaw += clamp(delta, -1, 1) * dt * 0.75 * trackHealth;
    // Slow into turns so the tank does not scrub sideways across a hillside.
    throttle = Math.abs(delta) > 1.1 ? 0.25 : 1;
  }
  const maxSpeed = TANK_MAX_SPEED * (0.45 + 0.55 * engineHealth) * (0.35 + 0.65 * trackHealth);
  const wantSpeed = throttle * (throttle < 0 ? 5 : maxSpeed);
  t.speed += clamp(wantSpeed - t.speed, -12 * dt, 5 * dt);

  /* gunnery */
  if (target && ai.hasLos && t.modules.gunner > 25) {
    aimPoint(target, _aim);
    tankMuzzle(t, _muzzle);
    const dist = _muzzle.distanceTo(_aim);
    const spec = WEAPONS.cannon;
    const flight = dist / spec.speed;
    velocityOf(target, _v).multiplyScalar(flight * (0.5 + ctx.skill * 0.5));
    _aim.add(_v);

    const originX = t.pos.x + Math.sin(t.yaw) * TANK_TURRET.z;
    const originZ = t.pos.z + Math.cos(t.yaw) * TANK_TURRET.z;
    const originY = t.pos.y + TANK_GUN_Y;
    const flat = Math.hypot(_aim.x - originX, _aim.z - originZ);
    const wantYaw = Math.atan2(_aim.x - originX, _aim.z - originZ);
    const wantPitch = ballisticPitch(flat, _aim.y - originY, spec.speed) ?? Math.atan2(_aim.y - originY, flat);

    const traverse = TURRET_TRAVERSE * (t.modules.gunner / 100) * dt;
    const wantLocal = angleDelta(t.yaw, wantYaw);
    t.turret = approachAngle(t.turret, wantLocal, traverse);
    t.barrel = clamp(
      t.barrel + clamp(wantPitch - t.barrel, -dt * 0.3, dt * 0.3),
      BARREL_MIN,
      BARREL_MAX,
    );

    const aimError = Math.abs(angleDelta(t.turret, wantLocal)) + Math.abs(wantPitch - t.barrel);
    if (aimError < 0.012 + (1 - ctx.skill) * 0.02 && now >= t.reloadUntil && dist < 400) {
      fireTankGun(t, ctx);
    } else if (target.kind === "soldier" && dist < 180 && aimError < 0.06 && now >= t.nextCoaxAt) {
      fireCoax(t, ctx, dist);
    }
  } else {
    // Point the gun where we are going.
    t.turret = approachAngle(t.turret, 0, TURRET_TRAVERSE * dt * 0.5);
    t.barrel += clamp(-t.barrel, -dt * 0.2, dt * 0.2);
  }
}

export function fireTankGun(t: Tank, ctx: AiContext) {
  if (t.ammo[t.shell] <= 0) {
    t.shell = t.shell === "ap" ? "he" : "ap";
    if (t.ammo[t.shell] <= 0) return;
  }
  t.ammo[t.shell]--;
  const reload = WEAPONS.cannon.reloadTime * (t.modules.gunner > 40 ? 1 : 1.6);
  t.reloadUntil = ctx.now + reload;
  t.flash = 0.08;

  tankMuzzle(t, _muzzle);
  const yaw = t.yaw + t.turret;
  const cp = Math.cos(t.barrel);
  _dir.set(Math.sin(yaw) * cp, Math.sin(t.barrel), Math.cos(yaw) * cp).normalize();
  ctx.battle.fire({
    kind: "shell",
    weapon: "cannon",
    shell: t.shell,
    from: _muzzle,
    dir: _dir,
    ownerId: t.id,
    team: t.team,
  });
  ctx.battle.suppressNear(_muzzle, t.team, 30, 25);
}

export function fireCoax(t: Tank, ctx: AiContext, dist: number) {
  if (t.coaxAmmo <= 0) {
    t.coaxAmmo = WEAPONS.coax.magazine;
    t.nextCoaxAt = ctx.now + WEAPONS.coax.reloadTime;
    return;
  }
  t.coaxAmmo--;
  t.nextCoaxAt = ctx.now + 60 / WEAPONS.coax.rpm;
  tankMuzzle(t, _muzzle);
  const yaw = t.yaw + t.turret;
  const cp = Math.cos(t.barrel);
  _dir.set(Math.sin(yaw) * cp, Math.sin(t.barrel), Math.cos(yaw) * cp).normalize();
  ctx.battle.fire({
    kind: "bullet",
    weapon: "coax",
    from: _muzzle,
    dir: _dir,
    ownerId: t.id,
    team: t.team,
    spread: WEAPONS.coax.spread * (1 + dist / 300),
  });
}

/* ---------------- aircraft ---------------- */

export function updatePlaneAI(p: Plane, ctx: AiContext, dt: number) {
  const ai = p.ai;
  if (!ai) return;
  const { now } = ctx;
  const ground = ctx.terrain.heightAt(p.pos.x, p.pos.z);
  const alt = p.pos.y - ground;

  if (now >= ai.nextThink) {
    ai.nextThink = now + 0.6;
    if (alt < 60 && ai.state !== "attack") ai.state = "climb";
    const air = findTarget(p, ctx, 500, false);
    const foeAir = air && air.kind === "plane" ? air : null;
    if (foeAir) {
      ai.state = "attack";
      ai.targetId = foeAir.id;
    } else {
      const groundTarget = findTarget(p, ctx, 700, true);
      ai.targetId = groundTarget ? groundTarget.id : null;
      if (ai.state !== "pull") ai.state = groundTarget ? "attack" : "cruise";
    }
    if (!ai.targetId) {
      const zone = ctx.objectiveFor(p.team);
      ai.goal.set(zone.x, ground + 150, zone.z);
    }
  }

  const target = ai.targetId !== null ? ctx.units.find((u) => u.id === ai.targetId) : undefined;

  // Choose a point to fly at.
  if (alt < 45 || now < ai.pullUntil) {
    if (now >= ai.pullUntil) ai.pullUntil = now + 2.4;
    ai.state = "pull";
    _aim.set(p.pos.x + Math.sin(headingOf(p)) * 200, ground + 220, p.pos.z + Math.cos(headingOf(p)) * 200);
  } else if (target && target.alive) {
    aimPoint(target, _aim);
    if (target.kind !== "plane") {
      const d = p.pos.distanceTo(_aim);
      // Approach on a shallow dive rather than straight down.
      if (d > 260) _aim.y += 90;
      else if (d > 110) _aim.y += 26;
    }
  } else {
    _aim.copy(ai.goal);
  }

  flyToward(p, _aim, dt, ctx);

  // Guns, when the nose is close to on.
  if (target && target.alive && now >= p.nextShotAt && p.ammo > 0) {
    aimPoint(target, _v);
    const d = p.pos.distanceTo(_v);
    if (d < 420) {
      forward(p, _dir);
      const flight = d / WEAPONS.aircannon.speed;
      velocityOf(target, _muzzle).multiplyScalar(flight);
      _v.add(_muzzle).sub(p.pos).normalize();
      if (_dir.dot(_v) > 0.995) {
        p.ammo--;
        p.nextShotAt = now + 60 / WEAPONS.aircannon.rpm;
        p.flash = 0.05;
        _muzzle.copy(p.pos).addScaledVector(_dir, 2.5);
        ctx.battle.fire({
          kind: "bullet",
          weapon: "aircannon",
          from: _muzzle,
          dir: _dir,
          ownerId: p.id,
          team: p.team,
          spread: WEAPONS.aircannon.spread * (1.8 - ctx.skill),
          inheritVel: p.vel,
        });
      }
    }
  }

  // A bomb on the way past, if there is armour underneath.
  if (target && target.kind === "tank" && p.bombs > 0 && alt < 130 && alt > 45) {
    const d = Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z);
    if (d < 60) {
      p.bombs--;
      forward(p, _dir);
      _muzzle.copy(p.pos).addScaledVector(_dir, 1).setY(p.pos.y - 1.2);
      ctx.battle.fire({
        kind: "bomb",
        weapon: "bomb",
        from: _muzzle,
        dir: _dir,
        ownerId: p.id,
        team: p.team,
        inheritVel: p.vel,
      });
      ai.pullUntil = now + 2.6;
    }
  }
}

function headingOf(p: Plane) {
  forward(p, _dir);
  return Math.atan2(_dir.x, _dir.z);
}

export function forward(p: Plane, out: THREE.Vector3) {
  return out.set(0, 0, 1).applyQuaternion(p.quat);
}

/** Steer an aircraft towards a point by rolling into the turn and pulling. */
function flyToward(p: Plane, point: THREE.Vector3, dt: number, ctx: AiContext) {
  const fwd = forward(p, _flyFwd);
  const up = _flyUp.set(0, 1, 0).applyQuaternion(p.quat);
  // up x fwd is the right wing: with a +Z nose and +Y up that is local +X.
  const right = _flyRight.crossVectors(up, fwd).normalize();
  const to = _flyTo.copy(point).sub(p.pos).normalize();

  const yawErr = to.dot(right);
  const pitchErr = to.dot(up);
  const agility = 1.1 + ctx.skill * 0.5;

  // Bank into the turn (right turn = right wing down = negative Z), then pull.
  // Nose up is a negative rotation about local X, because the nose is +Z.
  const rollCmd = clamp(-yawErr * 2.2, -1, 1);
  const pitchCmd = clamp(-(pitchErr * 2.2 + 0.1), -1, 1);

  _flyQuat.setFromAxisAngle(_AXIS_Z, rollCmd * agility * dt);
  p.quat.multiply(_flyQuat);
  _flyQuat.setFromAxisAngle(_AXIS_X, pitchCmd * agility * dt);
  p.quat.multiply(_flyQuat);
  _flyQuat.setFromAxisAngle(_AXIS_Y, yawErr * 0.4 * dt);
  p.quat.multiply(_flyQuat);
  p.quat.normalize();

  p.throttle = clamp(p.throttle + (0.85 - p.throttle) * dt, 0, 1);
  p.speed += (PLANE_MAX_SPEED * p.throttle * 0.82 - p.speed) * dt * 0.5;
}

const _flyFwd = new THREE.Vector3();
const _flyUp = new THREE.Vector3();
const _flyRight = new THREE.Vector3();
const _flyTo = new THREE.Vector3();
const _flyQuat = new THREE.Quaternion();
const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _AXIS_Z = new THREE.Vector3(0, 0, 1);

/**
 * Elevation needed to drop a shell on a point `flat` metres away and `rise`
 * metres up. Returns null when the shot is out of reach.
 */
export function ballisticPitch(flat: number, rise: number, speed: number) {
  const g = 9.81;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * flat * flat + 2 * rise * v2);
  if (disc < 0) return null;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * flat));
}
