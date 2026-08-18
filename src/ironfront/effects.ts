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
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.tracers.frustumCulled = false;
    this.group.add(this.tracers);

    const decalGeo = new THREE.CircleGeometry(1, 7);
    decalGeo.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(
      decalGeo,
      new THREE.MeshBasicMaterial({
        color: 0x1c1712,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      MAX_DECALS,
    );
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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

  impact(pos: THREE.Vector3, normal: THREE.Vector3, kind: "dirt" | "metal" | "stone" | "flesh") {
    const palette = {
      dirt: { spark: 0x8a7350, smoke: 0x8b7f68, count: 12 },
      metal: { spark: 0xffe0a0, smoke: 0x6f6a60, count: 14 },
      stone: { spark: 0xc9c3b4, smoke: 0x9a958a, count: 10 },
      flesh: { spark: 0x8e2d2a, smoke: 0x7a2320, count: 8 },
    }[kind];
    this.burst(pos, palette.count, 7, {
      color: palette.spark,
      size: 0.16,
      life: 0.45,
      drag: 0.5,
      gravity: 14,
    }, normal, 0.55);
    this.burst(pos, 4, 2.4, {
      color: palette.smoke,
      size: 0.55,
      life: 0.7,
      drag: 0.4,
      gravity: -0.6,
      growth: 2.4,
    }, normal, 0.7);
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

  /** A scorch mark on the ground. `y` is expected to already sit on the terrain. */
  scar(pos: THREE.Vector3, radius: number) {
    const i = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    this.decalCount = Math.min(MAX_DECALS, this.decalCount + 1);
    this.dummy.position.set(pos.x, pos.y + 0.06, pos.z);
    this.dummy.rotation.set(0, Math.random() * Math.PI, 0);
    this.dummy.scale.setScalar(radius * (0.8 + Math.random() * 0.5));
    this.dummy.updateMatrix();
    this.decals.setMatrixAt(i, this.dummy.matrix);
    this.decals.count = this.decalCount;
    this.decals.instanceMatrix.needsUpdate = true;
  }

  /** Queue a tracer segment for this frame. Cleared every update. */
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
    for (let v = 0; v < 2; v++) {
      this.tracerCol[i * 6 + v * 3] = this.tmpColor.r;
      this.tracerCol[i * 6 + v * 3 + 1] = this.tmpColor.g;
      this.tracerCol[i * 6 + v * 3 + 2] = this.tmpColor.b;
    }
  }

  beginFrame() {
    this.tracerCount = 0;
  }

  update(dt: number) {
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
