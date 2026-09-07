import * as THREE from "three";

/**
 * Particles, tracers and impact scars. One Points object, one LineSegments
 * object and one instanced decal mesh carry every effect in the game, so a
 * busy firefight still costs three draw calls.
 */

const MAX_PARTICLES = 4000;
const MAX_TRACERS = 400;
const MAX_DECALS = 600;

const particleVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uScale / max(-mv.z, 0.6), 1.0, 150.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;
    float edge = 1.0 - smoothstep(0.16, 0.25, r2);
    gl_FragColor = vec4(vColor, vAlpha * edge);
  }
`;

/** How much of its colour a tracer keeps at the tail end of the streak. */
const TRACER_TAIL = 0.08;

/** The materials a round can strike, which decide what it throws up. */
export type ImpactKind = "dirt" | "metal" | "stone" | "flesh";

export type ParticleOpts = {
  color: number;
  /** Diameter in world units, not pixels. */
  size: number;
  life: number;
  /** Per-second multiplier applied to velocity. 1 = no drag. */
  drag?: number;
  gravity?: number;
  /** Size at the end of life, relative to the start. */
  growth?: number;
  fade?: number;
};

export class Effects {
  readonly group = new THREE.Group();

  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 3);
  private sizes = new Float32Array(MAX_PARTICLES);
  private alphas = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private growth = new Float32Array(MAX_PARTICLES);
  private baseSize = new Float32Array(MAX_PARTICLES);
  private fade = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private points: THREE.Points;
  private pointMat: THREE.ShaderMaterial;

  private tracerPos = new Float32Array(MAX_TRACERS * 6);
  private tracerCol = new Float32Array(MAX_TRACERS * 6);
  private tracerCount = 0;
  private tracers: THREE.LineSegments;

  private decals: THREE.InstancedMesh;
  private decalCursor = 0;
  private decalCount = 0;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  /** Secondary blasts queued to go off a moment after a vehicle brews up. */
  private pending: { at: number; pos: THREE.Vector3; scale: number }[] = [];

  /** Point lights recycled for muzzle flashes and explosions. */
  private lights: { light: THREE.PointLight; life: number; maxLife: number; peak: number }[] = [];

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, MAX_PARTICLES);
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.pointMat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute("position", new THREE.BufferAttribute(this.tracerPos, 3));
    tgeo.setAttribute("color", new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracers = new THREE.LineSegments(
      tgeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.tracers.frustumCulled = false;
    this.group.add(this.tracers);

    const decalGeo = new THREE.CircleGeometry(1, 7);
    decalGeo.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(
      decalGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      MAX_DECALS,
    );
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Per-instance colour lets one pool carry both the small brown puncture a
    // rifle round leaves and the wide black scorch a shell leaves, instead of
    // needing a second mesh and a second draw call for each.
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3).fill(1), 3);
    this.decals.frustumCulled = false;
    this.decals.count = 0;
    this.group.add(this.decals);

    for (let i = 0; i < 10; i++) {
      const light = new THREE.PointLight(0xffb060, 0, 60, 2);
      light.visible = false;
      this.group.add(light);
      this.lights.push({ light, life: 0, maxLife: 1, peak: 0 });
    }
  }

  /** Point sprites scale with the viewport, so the shader needs the height. */
  setViewportScale(height: number, fov: number) {
    this.pointMat.uniforms.uScale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, o: ParticleOpts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.vel[i * 3] = vel.x;
    this.vel[i * 3 + 1] = vel.y;
    this.vel[i * 3 + 2] = vel.z;
    this.tmpColor.setHex(o.color).convertSRGBToLinear();
    this.colors[i * 3] = this.tmpColor.r;
    this.colors[i * 3 + 1] = this.tmpColor.g;
    this.colors[i * 3 + 2] = this.tmpColor.b;
    this.baseSize[i] = o.size;
    this.sizes[i] = o.size;
    this.alphas[i] = 1;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.drag[i] = o.drag ?? 0.6;
    this.grav[i] = o.gravity ?? 0;
    this.growth[i] = o.growth ?? 1;
    this.fade[i] = o.fade ?? 1;
  }

  /** Cone of debris/sparks/smoke thrown from a point. */
  burst(
    pos: THREE.Vector3,
    count: number,
    speed: number,
    o: ParticleOpts,
    dir?: THREE.Vector3,
    spread = 1,
  ) {
    for (let i = 0; i < count; i++) {
      _v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (dir) _v.lerp(dir, 1 - spread).normalize();
      const s = speed * (0.4 + Math.random() * 0.8);
      _v.multiplyScalar(s);
      _p.copy(pos);
      this.spawn(_p, _v, { ...o, life: o.life * (0.6 + Math.random() * 0.8), size: o.size * (0.7 + Math.random() * 0.7) });
    }
  }

  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, scale: number) {
    this.burst(pos, Math.round(4 + scale * 5), 6 * scale, {
      color: 0xffd27a,
      size: 0.55 * scale,
      life: 0.12,
      drag: 0.02,
      growth: 1.8,
    }, dir, 0.35);
    if (scale > 0.6) {
      this.burst(pos, 8, 4 * scale, {
        color: 0x6f6a60,
        size: 1.1 * scale,
        life: 0.9,
        drag: 0.3,
        gravity: 1.2,
        growth: 3,
      }, dir, 0.5);
      this.flash(pos, 0xffb060, 26 * scale, 0.09);
    }
  }

  /**
   * What a round striking a surface throws up. Each material behaves like
   * itself rather than being one recoloured puff: soil lofts a slow dust cloud
   * and a few heavy clods, stone shatters into pale chips that bounce, steel
   * throws hot sparks that arc and die, and flesh gives a fine mist and no
   * debris at all.
   *
   * `energy` is roughly "how big was the round" — 1 for a rifle bullet, up
   * towards 6 for a tank shell striking dirt — and scales the whole thing so a
   * 122 mm hit does not look like a pistol shot.
   */
  impact(pos: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind, energy = 1) {
    const e = Math.max(0.35, energy);
    if (kind === "flesh") {
      this.burst(pos, 9, 3.4, {
        color: 0x7e2422,
        size: 0.13,
        life: 0.4,
        drag: 0.6,
        gravity: 11,
      }, normal, 0.7);
      this.burst(pos, 4, 1.4, {
        color: 0x5c1a19,
        size: 0.3,
        life: 0.5,
        drag: 0.8,
        gravity: 1.5,
        growth: 2,
        fade: 0.55,
      }, normal, 0.9);
      return;
    }

    if (kind === "metal") {
      // Sparks are struck metal, not fire: they fly fast, fall hard and are
      // gone quickly, so a burst of them reads as a strike rather than a hit.
      this.burst(pos, Math.round(10 + 8 * e), 11 * Math.sqrt(e), {
        color: 0xffd98a,
        size: 0.1,
        life: 0.34,
        drag: 0.35,
        gravity: 22,
      }, normal, 0.75);
      this.burst(pos, 3, 2.2, {
        color: 0x6f6a60,
        size: 0.4 * e,
        life: 0.55,
        drag: 0.5,
        gravity: -0.5,
        growth: 2.6,
        fade: 0.5,
      }, normal, 0.8);
      this.flash(pos, 0xffc070, 5 * e, 0.05);
      return;
    }

    if (kind === "stone") {
      this.burst(pos, Math.round(8 + 6 * e), 9 * Math.sqrt(e), {
        color: 0xd8d2c4,
        size: 0.12 * e,
        life: 0.6,
        drag: 0.3,
        gravity: 17,
      }, normal, 0.6);
      this.burst(pos, Math.round(4 + 3 * e), 2.6, {
        color: 0xa8a294,
        size: 0.5 * e,
        life: 0.9,
        drag: 0.45,
        gravity: -0.7,
        growth: 2.8,
        fade: 0.6,
      }, normal, 0.85);
      return;
    }

    // Dirt. The dust is the loud part — it hangs, spreads and drifts up — and
    // the clods are what sell the scale of whatever made it.
    this.burst(pos, Math.round(3 + 5 * e), 1.6 + e, {
      color: 0x9c8e72,
      size: 0.26 * e,
      life: 0.7 + e * 0.4,
      drag: 0.5,
      gravity: -0.55,
      growth: 3.2,
      fade: 0.5,
    }, normal, 0.85);
    this.burst(pos, Math.round(5 + 5 * e), 7 * Math.sqrt(e), {
      color: 0x6d5b3f,
      size: 0.13 * e,
      life: 0.75,
      drag: 0.25,
      gravity: 19,
    }, normal, 0.5);
  }

  /**
   * The spray thrown off when a shell fails to bite and skates away. Aimed
   * along where the round went, so a bounce is legible as a bounce from
   * outside the tank as well as inside it.
   */
  ricochetSpray(pos: THREE.Vector3, along: THREE.Vector3, energy = 1) {
    const e = Math.max(0.5, energy);
    this.burst(pos, Math.round(12 + 10 * e), 16 * Math.sqrt(e), {
      color: 0xffe6a8,
      size: 0.12,
      life: 0.42,
      drag: 0.2,
      gravity: 16,
    }, along, 0.25);
    this.flash(pos, 0xffd28a, 8 * e, 0.07);
  }

  explosion(pos: THREE.Vector3, radius: number) {
    const s = radius / 8;
    this.burst(pos, Math.round(22 * s) + 12, 16 * s, {
      color: 0xffc255,
      size: 1.7 * s,
      life: 0.42,
      drag: 0.25,
      growth: 2.2,
    });
    this.burst(pos, Math.round(26 * s) + 14, 9 * s, {
      color: 0x3a352e,
      size: 2.4 * s,
      life: 2.4,
      drag: 0.35,
      gravity: -1.4,
      growth: 3.4,
      fade: 0.6,
    });
    this.burst(pos, Math.round(18 * s) + 10, 20 * s, {
      color: 0x7a6a4d,
      size: 0.22,
      life: 1.1,
      drag: 0.7,
      gravity: 20,
    });
    this.flash(pos, 0xffa040, 60 * s, 0.35);
    this.scar(pos, radius * 0.55);
  }

  /**
   * A vehicle coming apart. Bigger and longer-lived than a shell burst: a
   * white-hot core, a fireball that climbs, the black column that follows it,
   * and debris thrown clear. `cookOff` queues the secondary bangs of ammunition
   * going up over the next few seconds, which is what makes a knocked-out tank
   * read as a knocked-out tank rather than a large grenade.
   */
  vehicleExplosion(pos: THREE.Vector3, scale = 1) {
    const s = scale;
    this.burst(pos, Math.round(14 * s) + 8, 9 * s, {
      color: 0xfff0c0,
      size: 2.2 * s,
      life: 0.22,
      drag: 0.3,
      growth: 2.6,
    });
    this.burst(pos, Math.round(26 * s) + 14, 15 * s, {
      color: 0xff9a3c,
      size: 2.6 * s,
      life: 0.75,
      drag: 0.28,
      gravity: -3.2,
      growth: 3.0,
    });
    this.burst(pos, Math.round(30 * s) + 18, 8 * s, {
      color: 0x2b2724,
      size: 3.2 * s,
      life: 3.6,
      drag: 0.32,
      gravity: -2.2,
      growth: 4.2,
      fade: 0.65,
    });
    // Debris: heavy, fast, and thrown flat as well as up.
    this.burst(pos, Math.round(16 * s) + 10, 24 * s, {
      color: 0x4a423a,
      size: 0.3 * s,
      life: 1.6,
      drag: 0.12,
      gravity: 26,
    });
    this.flash(pos, 0xffa848, 110 * s, 0.5);
    this.scar(_p.copy(pos).setY(pos.y - 1.4), 5.5 * s);
    for (let i = 0; i < 3; i++) {
      this.pending.push({ at: 0.5 + Math.random() * 2.6, pos: pos.clone(), scale: s });
    }
  }

  /**
   * Smoke and flame off a vehicle that is hurt but still running. Called
   * repeatedly while damaged; `severity` from 0 (a wisp) to 1 (burning), so
   * how badly a tank is hit is visible from outside it without a health bar
   * floating over the battlefield.
   */
  vehicleDamage(pos: THREE.Vector3, severity: number) {
    _p.copy(pos).add(_v.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
    this.spawn(_p, _v.set((Math.random() - 0.5) * 0.6, 3.4 + severity * 3, (Math.random() - 0.5) * 0.6), {
      color: severity > 0.62 ? 0x2a2724 : 0x6b675f,
      size: 0.7 + severity * 0.9,
      life: 1.6 + severity * 1.4,
      drag: 0.2,
      gravity: -1.5,
      growth: 3.0,
      fade: 0.3 + severity * 0.35,
    });
    if (severity > 0.62 && Math.random() < 0.4) {
      this.spawn(_p, _v.set((Math.random() - 0.5) * 0.5, 2.4, (Math.random() - 0.5) * 0.5), {
        color: 0xff8a30,
        size: 0.55,
        life: 0.35,
        drag: 0.4,
        gravity: -3,
        growth: 1.6,
      });
    }
  }

  /** Oily column left rising off a wreck. Called every so often, not per frame. */
  wreckSmoke(pos: THREE.Vector3) {
    _p.copy(pos).add(_v.set(Math.random() - 0.5, 0.6, Math.random() - 0.5));
    this.spawn(_p, _v.set((Math.random() - 0.5) * 0.5, 5.5 + Math.random() * 2, (Math.random() - 0.5) * 0.5), {
      color: 0x37312b,
      size: 1.4,
      life: 4.2,
      drag: 0.1,
      gravity: -1.6,
      growth: 3.2,
      fade: 0.3,
    });
  }

  dust(pos: THREE.Vector3, amount: number) {
    for (let i = 0; i < amount; i++) {
      _p.copy(pos).add(_v.set((Math.random() - 0.5) * 1.6, 0.1, (Math.random() - 0.5) * 1.6));
      this.spawn(_p, _v.set((Math.random() - 0.5) * 1.4, 0.5 + Math.random(), (Math.random() - 0.5) * 1.4), {
        color: 0x8f8267,
        size: 1.0,
        life: 1.3,
        drag: 0.5,
        gravity: -0.3,
        growth: 2.6,
        fade: 0.4,
      });
    }
  }

  flash(pos: THREE.Vector3, color: number, intensity: number, life: number) {
    let slot = this.lights.find((l) => l.life <= 0);
    if (!slot) slot = this.lights[0];
    slot.light.position.copy(pos);
    slot.light.color.setHex(color);
    slot.light.distance = 20 + intensity;
    slot.life = life;
    slot.maxLife = life;
    slot.peak = intensity;
    slot.light.intensity = intensity;
    slot.light.visible = true;
  }

  /**
   * Lay a flat mark on a surface, lying in the plane the normal describes so
   * it sits flush on a hillside or a wall rather than only on level ground.
   */
  private placeDecal(pos: THREE.Vector3, normal: THREE.Vector3, radius: number, color: number) {
    const i = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    this.decalCount = Math.min(MAX_DECALS, this.decalCount + 1);
    // The disc is built facing +Y, so turning +Y onto the surface normal lays
    // it flat against whatever was hit; the spin after is just so repeats of
    // the same mark do not tile visibly.
    this.dummy.quaternion.setFromUnitVectors(_up, normal);
    this.dummy.position.copy(pos).addScaledVector(normal, 0.05);
    this.dummy.rotateY(Math.random() * Math.PI);
    this.dummy.scale.setScalar(radius * (0.8 + Math.random() * 0.5));
    this.dummy.updateMatrix();
    this.decals.setMatrixAt(i, this.dummy.matrix);
    this.decals.setColorAt(i, this.tmpColor.setHex(color).convertSRGBToLinear());
    this.decals.count = this.decalCount;
    this.decals.instanceMatrix.needsUpdate = true;
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
  }

  /** A scorch mark on the ground. `y` is expected to already sit on the terrain. */
  scar(pos: THREE.Vector3, radius: number) {
    this.placeDecal(_p.copy(pos).setY(pos.y + 0.01), _up, radius, 0x1c1712);
  }

  /**
   * The mark a single round leaves behind. Small, and tinted to the surface —
   * a puncture in soil reads as turned earth, one in stone as pale chipping.
   * Without these a firefight leaves no trace of itself once the dust settles.
   */
  bulletHole(pos: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind) {
    if (kind === "flesh") return;
    const color = kind === "dirt" ? 0x2e2419 : kind === "stone" ? 0x55504a : 0x1a1a1c;
    this.placeDecal(pos, normal, kind === "metal" ? 0.09 : 0.15, color);
  }

  /**
   * Queue a tracer segment for this frame. Cleared every update.
   *
   * `from` is the tail and `to` the round itself. The tail vertex is dimmed
   * towards black so the streak fades out behind the round instead of being a
   * uniform stick of light with a hard end — the line is additively blended,
   * so a dark vertex simply contributes nothing and the taper costs no extra
   * geometry.
   */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    if (this.tracerCount >= MAX_TRACERS) return;
    const i = this.tracerCount++;
    this.tracerPos[i * 6] = from.x;
    this.tracerPos[i * 6 + 1] = from.y;
    this.tracerPos[i * 6 + 2] = from.z;
    this.tracerPos[i * 6 + 3] = to.x;
    this.tracerPos[i * 6 + 4] = to.y;
    this.tracerPos[i * 6 + 5] = to.z;
    this.tmpColor.setHex(color).convertSRGBToLinear();
    this.tracerCol[i * 6] = this.tmpColor.r * TRACER_TAIL;
    this.tracerCol[i * 6 + 1] = this.tmpColor.g * TRACER_TAIL;
    this.tracerCol[i * 6 + 2] = this.tmpColor.b * TRACER_TAIL;
    this.tracerCol[i * 6 + 3] = this.tmpColor.r;
    this.tracerCol[i * 6 + 4] = this.tmpColor.g;
    this.tracerCol[i * 6 + 5] = this.tmpColor.b;
  }

  beginFrame() {
    this.tracerCount = 0;
  }

  update(dt: number) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      q.at -= dt;
      if (q.at > 0) continue;
      this.pending.splice(i, 1);
      _p.copy(q.pos).add(_v.set((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2));
      this.burst(_p, Math.round(10 * q.scale) + 6, 11 * q.scale, {
        color: 0xffb352,
        size: 1.3 * q.scale,
        life: 0.5,
        drag: 0.3,
        gravity: -2,
        growth: 2.4,
      });
      this.flash(_p, 0xffa040, 34 * q.scale, 0.18);
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        if (this.alphas[i] !== 0) this.alphas[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      const k = 1 - Math.min(1, this.drag[i] * dt * 4);
      const b = i * 3;
      this.vel[b + 1] -= this.grav[i] * dt;
      this.vel[b] *= k;
      this.vel[b + 1] *= k;
      this.vel[b + 2] *= k;
      this.positions[b] += this.vel[b] * dt;
      this.positions[b + 1] += this.vel[b + 1] * dt;
      this.positions[b + 2] += this.vel[b + 2] * dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      this.sizes[i] = this.baseSize[i] * (1 + (this.growth[i] - 1) * t);
      this.alphas[i] = Math.max(0, (1 - t) * this.fade[i]);
    }
    const geo = this.points.geometry;
    geo.getAttribute("position").needsUpdate = true;
    geo.getAttribute("color").needsUpdate = true;
    geo.getAttribute("size").needsUpdate = true;
    geo.getAttribute("alpha").needsUpdate = true;

    this.tracers.geometry.setDrawRange(0, this.tracerCount * 2);
    this.tracers.geometry.getAttribute("position").needsUpdate = true;
    this.tracers.geometry.getAttribute("color").needsUpdate = true;

    for (const l of this.lights) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) {
        l.light.visible = false;
        l.light.intensity = 0;
      } else {
        l.light.intensity = l.peak * (l.life / l.maxLife);
      }
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.pointMat.dispose();
    this.tracers.geometry.dispose();
    (this.tracers.material as THREE.Material).dispose();
    this.decals.geometry.dispose();
    (this.decals.material as THREE.Material).dispose();
  }
}

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
