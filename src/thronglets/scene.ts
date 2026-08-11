import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Colony, BLOCK, type ColonyStats, type Thronglet } from "./colony";
import { emoteTextures } from "./emotes";
import {
  appleGeometry,
  blockGeometry,
  bushGeometry,
  eggGeometry,
  NECK_HEIGHT,
  plankGeometry,
  throngletGeometries,
  treeGeometry,
  tubGeometry,
} from "./models";
import { buildTerrain, WORLD_RADIUS } from "./world";
import { mulberry32 } from "./random";

export type Tool = "inspect" | "food" | "plant";

export type SimSnapshot = ColonyStats & {
  time: number;
  dayPhase: number;
  isNight: boolean;
  fps: number;
  log: { t: number; text: string; kind: string }[];
  history: number[];
};

const SKY_NIGHT = new THREE.Color(0x0a1030);
const SKY_DUSK = new THREE.Color(0xef9a63);
const SKY_DAY = new THREE.Color(0x8ecbf5);

const MAX_AGENTS = 200;
const MAX_BLOCKS = 6000;
const MAX_APPLES = 900;
const MAX_EGGS = 60;

export class ThrongletSim {
  readonly canvas: HTMLCanvasElement;
  colony: Colony;

  speed = 1;
  paused = false;
  tool: Tool = "inspect";
  pixelated = true;
  shadows = true;

  onSnapshot?: (s: SimSnapshot) => void;
  onSelect?: (t: Thronglet | null) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;

  private bodies!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private eggMesh!: THREE.InstancedMesh;
  private blocks!: THREE.InstancedMesh;
  private apples!: THREE.InstancedMesh;
  private treeMesh!: THREE.InstancedMesh;
  private bushMesh!: THREE.InstancedMesh;
  private tubMesh!: THREE.InstancedMesh;
  private dropMesh!: THREE.InstancedMesh;
  private planks!: THREE.InstancedMesh;
  private fireflies!: THREE.Points;
  private outline = new THREE.Group();
  private ring!: THREE.Mesh;
  private siteMarkers = new THREE.Group();

  private worldGroup = new THREE.Group();
  private selectedId: number | null = null;
  private follow = false;

  private pointer = new THREE.Vector2();
  private down = new THREE.Vector2();
  private downTime = 0;
  private ray = new THREE.Raycaster();
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  private lastBlockCount = -1;
  private lastAppleKey = -1;
  private lastTreeCount = -1;
  private lastSiteCount = -1;
  private statAccum = 0;
  private frames = 0;
  private fps = 0;

  private emotePool: THREE.Sprite[] = [];

  constructor(canvas: HTMLCanvasElement, seed = Math.floor(Math.random() * 1e9)) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(SKY_DAY);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
    this.camera.position.set(24, 26, 30);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 110;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.target.set(0, 1, 0);

    this.scene.fog = new THREE.Fog(SKY_DAY.getHex(), 60, 190);
    this.scene.add(this.worldGroup);

    this.hemi = new THREE.HemisphereLight(0xbfe3ff, 0x6f8a52, 1.9);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 4.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 46;
    sc.bottom = -46;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    sc.updateProjectionMatrix();
    this.scene.add(this.hemi, this.ambient, this.sun, this.sun.target);

    this.colony = new Colony(seed, buildTerrain);
    this.buildScene();
    this.attachEvents();
    this.resize();
  }

  /* ---------------- setup ---------------- */

  private buildScene() {
    const { body, head } = throngletGeometries();
    const lambert = () =>
      new THREE.MeshLambertMaterial({ vertexColors: true });

    this.bodies = new THREE.InstancedMesh(body, lambert(), MAX_AGENTS);
    this.heads = new THREE.InstancedMesh(head, lambert(), MAX_AGENTS);
    for (const m of [this.bodies, this.heads]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.worldGroup.add(m);
    }
    // Per-instance tint carries each thronglet's inherited hue.
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_AGENTS * 3).fill(1),
      3,
    );
    this.heads.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_AGENTS * 3).fill(1),
      3,
    );

    this.eggMesh = new THREE.InstancedMesh(eggGeometry(), lambert(), MAX_EGGS);
    this.eggMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eggMesh.castShadow = true;
    this.eggMesh.frustumCulled = false;
    this.eggMesh.count = 0;
    this.worldGroup.add(this.eggMesh);

    this.blocks = new THREE.InstancedMesh(
      blockGeometry(BLOCK * 0.98),
      new THREE.MeshLambertMaterial(),
      MAX_BLOCKS,
    );
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.frustumCulled = false;
    this.blocks.count = 0;
    this.worldGroup.add(this.blocks);

    this.apples = new THREE.InstancedMesh(appleGeometry(), lambert(), MAX_APPLES);
    this.apples.frustumCulled = false;
    this.apples.count = 0;
    this.worldGroup.add(this.apples);

    this.dropMesh = new THREE.InstancedMesh(appleGeometry(), lambert(), 200);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.worldGroup.add(this.dropMesh);

    // Wood in transit, so the gather → build loop is legible at a glance.
    this.planks = new THREE.InstancedMesh(plankGeometry(), lambert(), MAX_AGENTS);
    this.planks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.planks.castShadow = true;
    this.planks.frustumCulled = false;
    this.planks.count = 0;
    this.worldGroup.add(this.planks);

    this.treeMesh = new THREE.InstancedMesh(treeGeometry(), lambert(), 400);
    this.treeMesh.castShadow = true;
    this.treeMesh.receiveShadow = true;
    this.treeMesh.frustumCulled = false;
    this.worldGroup.add(this.treeMesh);

    this.bushMesh = new THREE.InstancedMesh(bushGeometry(), lambert(), 200);
    this.bushMesh.castShadow = true;
    this.bushMesh.frustumCulled = false;
    this.worldGroup.add(this.bushMesh);

    this.tubMesh = new THREE.InstancedMesh(tubGeometry(), lambert(), 16);
    this.tubMesh.castShadow = true;
    this.tubMesh.receiveShadow = true;
    this.tubMesh.frustumCulled = false;
    this.worldGroup.add(this.tubMesh);

    // Selection: a green ring plus a back-face outline shell, the way the
    // creature is highlighted in the show.
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x5dff7a,
      side: THREE.BackSide,
      fog: false,
    });
    const ob = new THREE.Mesh(body, outlineMat);
    const oh = new THREE.Mesh(head, outlineMat);
    this.outline.add(ob, oh);
    this.outline.visible = false;
    this.worldGroup.add(this.outline);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: 0x5dff7a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.worldGroup.add(this.ring);

    this.worldGroup.add(this.siteMarkers);

    this.buildFireflies();
    this.buildEmotePool();
    this.mountWorld();
  }

  private buildFireflies() {
    const n = 220;
    const pos = new Float32Array(n * 3);
    const rand = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * WORLD_RADIUS;
      pos[i * 3] = Math.cos(a) * d;
      pos[i * 3 + 1] = 0.6 + rand() * 3.2;
      pos[i * 3 + 2] = Math.sin(a) * d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, "rgba(255,246,170,1)");
    grad.addColorStop(1, "rgba(255,246,170,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);

    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.5,
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    );
    this.fireflies.frustumCulled = false;
    this.worldGroup.add(this.fireflies);
  }

  private buildEmotePool() {
    const tex = emoteTextures();
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex.heart,
          transparent: true,
          depthTest: false,
          fog: false,
        }),
      );
      s.scale.setScalar(0.55);
      s.visible = false;
      s.renderOrder = 10;
      this.emotePool.push(s);
      this.worldGroup.add(s);
    }
  }

  /** (Re)attach terrain + static flora for the current colony. */
  private mountWorld() {
    const c = this.colony;
    this.worldGroup.add(c.terrain.mesh, c.terrain.water);

    c.trees.forEach((t, i) => {
      this.dummy.position.set(t.x, t.y - 0.1, t.z);
      this.dummy.rotation.set(0, t.rot, 0);
      this.dummy.scale.setScalar(t.scale);
      this.dummy.updateMatrix();
      this.treeMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.treeMesh.count = c.trees.length;
    this.treeMesh.instanceMatrix.needsUpdate = true;
    this.lastTreeCount = c.trees.length;

    c.bushes.forEach((b, i) => {
      this.dummy.position.set(b.x, b.y - 0.05, b.z);
      this.dummy.rotation.set(0, b.id * 1.7, 0);
      this.dummy.scale.setScalar(b.scale);
      this.dummy.updateMatrix();
      this.bushMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.bushMesh.count = c.bushes.length;
    this.bushMesh.instanceMatrix.needsUpdate = true;

    c.tubs.forEach((t, i) => {
      this.dummy.position.set(t.x, t.y, t.z);
      this.dummy.rotation.set(0, t.rot, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.tubMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.tubMesh.count = c.tubs.length;
    this.tubMesh.instanceMatrix.needsUpdate = true;

    this.frameColony();
  }

  /**
   * Open on the colony from above — a steep top-down look at the island, tilted
   * just enough that the creatures still face the camera. Orbiting from here is
   * up to the player.
   */
  private frameColony() {
    const list = this.colony.thronglets;
    let x = 0;
    let z = 0;
    for (const t of list) {
      x += t.x;
      z += t.z;
    }
    if (list.length) {
      x /= list.length;
      z /= list.length;
    }
    const ground = this.colony.terrain.height(x, z);
    this.controls.target.set(x, ground + 0.6, z);
    this.camera.position.set(x, ground + 23, z + 10.7);
    this.controls.update();
  }

  /* ---------------- events ---------------- */

  private onPointerDown = (e: PointerEvent) => {
    this.down.set(e.clientX, e.clientY);
    this.downTime = performance.now();
  };

  private onPointerUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    if (moved > 6 || performance.now() - this.downTime > 600) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.handleClick();
  };

  private onResize = () => this.resize();

  private attachEvents() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.onResize);
  }

  private handleClick() {
    this.ray.setFromCamera(this.pointer, this.camera);

    if (this.tool === "inspect") {
      // The head is most of the silhouette, so both halves have to be pickable.
      const hit = this.ray
        .intersectObjects([this.bodies, this.heads], false)
        .sort((a, b) => a.distance - b.distance)[0];
      if (hit && hit.instanceId !== undefined) {
        const t = this.colony.thronglets[hit.instanceId];
        if (t) {
          if (this.selectedId === t.id) this.colony.pet(t);
          this.selectedId = t.id;
          this.onSelect?.(t);
          return;
        }
      }
      this.selectedId = null;
      this.onSelect?.(null);
      return;
    }

    const ground = this.ray.intersectObject(this.colony.terrain.mesh, false)[0];
    if (!ground) return;
    const p = ground.point;
    if (this.tool === "food") this.colony.dropFood(p.x, p.z);
    else if (this.tool === "plant") this.colony.plantTree(p.x, p.z);
  }

  /* ---------------- public controls ---------------- */

  start() {
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  setTool(tool: Tool) {
    this.tool = tool;
  }

  setPixelated(on: boolean) {
    this.pixelated = on;
    this.resize();
  }

  setShadows(on: boolean) {
    this.shadows = on;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
  }

  setFollow(on: boolean) {
    this.follow = on;
  }

  select(id: number | null) {
    this.selectedId = id;
    this.onSelect?.(this.colony.thronglets.find((t) => t.id === id) ?? null);
  }

  focusSelected() {
    const t = this.colony.thronglets.find((x) => x.id === this.selectedId);
    if (!t) return;
    this.controls.target.set(t.x, t.y + 0.6, t.z);
    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, 9);
  }

  reseed(seed = Math.floor(Math.random() * 1e9)) {
    const c = this.colony;
    this.worldGroup.remove(c.terrain.mesh, c.terrain.water);
    c.terrain.mesh.geometry.dispose();
    (c.terrain.mesh.material as THREE.Material).dispose();
    c.terrain.water.geometry.dispose();
    (c.terrain.water.material as THREE.Material).dispose();

    this.colony = new Colony(seed, buildTerrain);
    this.selectedId = null;
    this.onSelect?.(null);
    this.lastBlockCount = -1;
    this.lastAppleKey = -1;
    this.lastSiteCount = -1;
    this.blocks.count = 0;
    this.siteMarkers.clear();
    this.mountWorld();
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const dpr = this.pixelated
      ? Math.min(window.devicePixelRatio || 1, 1) / 2.6
      : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.onResize);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    this.renderer.dispose();
  }

  /* ---------------- frame ---------------- */

  private frame() {
    const raw = Math.min(this.clock.getDelta(), 0.05);
    const dt = this.paused ? 0 : raw * this.speed;

    if (dt > 0) {
      // Step in slices so high speeds stay stable.
      let left = dt;
      while (left > 0) {
        const step = Math.min(left, 0.05);
        this.colony.update(step);
        left -= step;
      }
    }

    this.syncAgents();
    this.syncEggs();
    this.syncBlocks();
    this.syncApples();
    this.syncDrops();
    this.syncSelection();
    this.syncSky();

    if (this.follow) {
      const t = this.colony.thronglets.find((x) => x.id === this.selectedId);
      if (t) this.controls.target.lerp(new THREE.Vector3(t.x, t.y + 0.6, t.z), 0.08);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.frames++;
    this.statAccum += raw;
    if (this.statAccum > 0.4) {
      this.fps = this.frames / this.statAccum;
      this.frames = 0;
      this.statAccum = 0;
      this.emitSnapshot();
    }
  }

  private emitSnapshot() {
    const c = this.colony;
    this.onSnapshot?.({
      ...c.stats(),
      time: c.time,
      dayPhase: c.dayPhase,
      isNight: c.isNight,
      fps: this.fps,
      log: c.log.slice(-8).reverse(),
      history: c.history,
    });
    if (this.selectedId !== null) {
      const t = c.thronglets.find((x) => x.id === this.selectedId);
      this.onSelect?.(t ?? null);
      if (!t) this.selectedId = null;
    }
  }

  private syncAgents() {
    const list = this.colony.thronglets;
    const n = Math.min(list.length, MAX_AGENTS);
    const bodyColors = this.bodies.instanceColor!;
    const headColors = this.heads.instanceColor!;

    let emote = 0;
    let carried = 0;
    const tex = emoteTextures();

    for (let i = 0; i < n; i++) {
      const t = list[i];
      const s = t.scale;
      const moving = Math.hypot(t.vx, t.vz);
      const walk = Math.sin(t.bob * 2.2);
      const asleep = t.task === "sleep";

      // Body: bobbing hop with a little squash-and-stretch.
      const lift = Math.abs(walk) * 0.05 * Math.min(1, moving) + t.hop * 0.12;
      const squash = 1 - Math.abs(walk) * 0.05 * Math.min(1, moving);
      this.dummy.position.set(t.x, t.y + lift, t.z);
      this.dummy.rotation.set(0, t.heading, walk * 0.05 * Math.min(1, moving));
      this.dummy.scale.set(s / squash, s * squash, s / squash);
      if (asleep) {
        this.dummy.rotation.z = 0.35;
        this.dummy.position.y = t.y;
      }
      this.dummy.updateMatrix();
      this.bodies.setMatrixAt(i, this.dummy.matrix);

      // Head: same transform, lagged, with an idle sway.
      const sway = Math.sin(t.bob * 1.6 - 0.5);
      this.dummy.position.set(
        t.x,
        t.y + lift + NECK_HEIGHT * s * squash,
        t.z,
      );
      this.dummy.rotation.set(
        sway * 0.04,
        t.heading + sway * 0.09,
        walk * 0.09 * Math.min(1, moving),
      );
      this.dummy.scale.set(s, s, s);
      if (asleep) {
        this.dummy.rotation.set(0.25, t.heading, 0.5);
        this.dummy.position.set(
          t.x + Math.sin(t.heading) * 0.12,
          t.y + NECK_HEIGHT * s * 0.82,
          t.z + Math.cos(t.heading) * 0.12,
        );
      }
      this.dummy.updateMatrix();
      this.heads.setMatrixAt(i, this.dummy.matrix);

      // Inherited hue plus a sickly tint when a thronglet is failing.
      const hue = t.genome.hue;
      const ill = THREE.MathUtils.clamp(t.health, 0.35, 1);
      this.tmpColor.setRGB(
        (1 + hue * 1.4) * ill,
        (1 - Math.abs(hue) * 0.5) * ill,
        (1 - hue * 2.2) * ill,
      );
      bodyColors.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
      headColors.setXYZ(i, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);

      // Logs held out in front, bobbing with the walk.
      if (t.carryingWood > 0) {
        const fx = Math.sin(t.heading);
        const fz = Math.cos(t.heading);
        this.dummy.position.set(
          t.x + fx * 0.33 * s,
          t.y + lift + 0.4 * s,
          t.z + fz * 0.33 * s,
        );
        this.dummy.rotation.set(walk * 0.12 * Math.min(1, moving), t.heading, 0);
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        this.planks.setMatrixAt(carried++, this.dummy.matrix);
      }

      // Emote bubble.
      const icon = t.emote?.icon ?? (asleep ? "zzz" : null);
      if (icon && emote < this.emotePool.length) {
        const sp = this.emotePool[emote++];
        sp.visible = true;
        (sp.material as THREE.SpriteMaterial).map = tex[icon] ?? tex.heart;
        (sp.material as THREE.SpriteMaterial).needsUpdate = true;
        sp.position.set(t.x, t.y + 1.62 * s + Math.sin(t.bob) * 0.05, t.z);
        sp.scale.setScalar(0.3 * s + 0.08);
      }
    }

    for (let i = emote; i < this.emotePool.length; i++)
      this.emotePool[i].visible = false;

    this.planks.count = carried;
    this.planks.instanceMatrix.needsUpdate = true;

    this.bodies.count = n;
    this.heads.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    // three caches an instanced bounding sphere on first raycast; drop it so
    // picking stays accurate while everyone is walking around.
    this.bodies.boundingSphere = null;
    this.heads.boundingSphere = null;
    bodyColors.needsUpdate = true;
    headColors.needsUpdate = true;

    // New trees can be planted at runtime.
    if (this.colony.trees.length !== this.lastTreeCount) {
      const c = this.colony;
      for (let i = this.lastTreeCount; i < c.trees.length; i++) {
        const t = c.trees[i];
        this.dummy.position.set(t.x, t.y - 0.1, t.z);
        this.dummy.rotation.set(0, t.rot, 0);
        this.dummy.scale.setScalar(t.scale);
        this.dummy.updateMatrix();
        this.treeMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.treeMesh.count = c.trees.length;
      this.treeMesh.instanceMatrix.needsUpdate = true;
      this.lastTreeCount = c.trees.length;
    }
  }

  private syncEggs() {
    const eggs = this.colony.eggs;
    const n = Math.min(eggs.length, MAX_EGGS);
    for (let i = 0; i < n; i++) {
      const e = eggs[i];
      const wobble = Math.sin(this.colony.time * 6 + e.id) * 0.08 * (e.timer < 6 ? 1 : 0.25);
      this.dummy.position.set(e.x, e.y, e.z);
      this.dummy.rotation.set(0, e.id, wobble);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.eggMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.eggMesh.count = n;
    this.eggMesh.instanceMatrix.needsUpdate = true;
  }

  private syncBlocks() {
    const c = this.colony;
    const total = c.sites.reduce((n, s) => n + s.placed, 0);
    if (total === this.lastBlockCount && c.sites.length === this.lastSiteCount)
      return;
    this.lastBlockCount = total;

    let i = 0;
    for (const site of c.sites) {
      for (let b = 0; b < site.placed && i < MAX_BLOCKS; b++, i++) {
        const blk = site.blocks[b];
        this.dummy.position.set(
          site.x + blk.x * BLOCK,
          site.y + blk.y * BLOCK + BLOCK * 0.5,
          site.z + blk.z * BLOCK,
        );
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.blocks.setMatrixAt(i, this.dummy.matrix);
        this.blocks.setColorAt(
          i,
          this.tmpColor.setHex(blk.color).convertSRGBToLinear(),
        );
      }
    }
    this.blocks.count = i;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;

    // Ghost outline for sites that have been marked out but not built.
    if (c.sites.length !== this.lastSiteCount) {
      this.lastSiteCount = c.sites.length;
      this.siteMarkers.clear();
      for (const s of c.sites) {
        if (s.complete) continue;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.7, 2.0, 20),
          new THREE.MeshBasicMaterial({
            color: 0xf2e06a,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(s.x, s.y + 0.06, s.z);
        this.siteMarkers.add(ring);
      }
    }
  }

  private syncApples() {
    const trees = this.colony.trees;
    let key = 0;
    for (const t of trees) key = (key * 31 + t.fruit) | 0;
    if (key === this.lastAppleKey) return;
    this.lastAppleKey = key;

    let i = 0;
    for (const t of trees) {
      for (let f = 0; f < t.fruit && i < MAX_APPLES; f++, i++) {
        const slot = t.fruitSlots[f % t.fruitSlots.length];
        this.dummy.position.set(
          t.x + slot.x,
          t.y + slot.y,
          t.z + slot.z,
        );
        this.dummy.rotation.set(0, f, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.apples.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.apples.count = i;
    this.apples.instanceMatrix.needsUpdate = true;
  }

  private syncDrops() {
    const drops = this.colony.drops;
    const n = Math.min(drops.length, 200);
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      this.dummy.position.set(
        d.x,
        d.y + 0.16 + Math.sin(this.colony.time * 3 + i) * 0.05,
        d.z,
      );
      this.dummy.rotation.set(0, this.colony.time + i, 0);
      this.dummy.scale.setScalar(1.2);
      this.dummy.updateMatrix();
      this.dropMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
  }

  private syncSelection() {
    const t = this.colony.thronglets.find((x) => x.id === this.selectedId);
    if (!t) {
      this.outline.visible = false;
      this.ring.visible = false;
      return;
    }
    const s = t.scale;
    this.outline.visible = true;
    const [ob, oh] = this.outline.children as THREE.Mesh[];
    ob.position.set(t.x, t.y, t.z);
    ob.rotation.set(0, t.heading, 0);
    ob.scale.setScalar(s * 1.09);
    oh.position.set(t.x, t.y + NECK_HEIGHT * s, t.z);
    oh.rotation.set(0, t.heading, 0);
    oh.scale.setScalar(s * 1.09);

    this.ring.visible = true;
    const pulse = 1 + Math.sin(this.colony.time * 4) * 0.06;
    this.ring.position.set(t.x, t.y + 0.05, t.z);
    this.ring.scale.setScalar(s * pulse);
  }

  private syncSky() {
    const p = this.colony.dayPhase;
    const elev = Math.sin(p * Math.PI * 2);
    const az = p * Math.PI * 2;

    this.sun.position.set(Math.cos(az) * 50, Math.max(-10, elev * 60), 25);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = THREE.MathUtils.clamp(elev * 6.5, 0, 4.8);
    this.sun.color.setHex(elev < 0.25 ? 0xffc48a : 0xfff3d6);

    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3.2, 0, 1);
    const day = THREE.MathUtils.clamp(elev * 2.4, 0, 1);
    const sky = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.7);

    this.renderer.setClearColor(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.hemi.intensity = 0.7 + day * 1.5;
    this.ambient.intensity = 0.45 + day * 0.7;
    this.hemi.color.setHex(day > 0.4 ? 0xbfe3ff : 0x6f8ad0);

    const mat = this.fireflies.material as THREE.PointsMaterial;
    mat.opacity = THREE.MathUtils.clamp(1 - day * 2.2, 0, 0.9);
    this.fireflies.position.y = Math.sin(this.colony.time * 0.7) * 0.25;

    const water = this.colony.terrain.water.material as THREE.MeshLambertMaterial;
    water.color.setHex(day > 0.35 ? 0x2f8fc4 : 0x14406a);
  }
}
