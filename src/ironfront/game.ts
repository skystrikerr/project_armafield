import * as THREE from "three";
import {
  AIRFIELDS,
  BASES,
  MAP_HALF,
  Terrain,
  ZONES,
  type Prop,
  type Zone,
} from "./terrain";
import {
  bannerGeometry,
  bushGeometry,
  crateGeometry,
  flagpoleGeometry,
  houseGeometry,
  lowPolyMaterial,
  rockGeometry,
  sandbagGeometry,
  stumpGeometry,
  treeGeometry,
} from "./models";
import { Effects } from "./effects";
import { Audio } from "./audio";
import { Battle, muzzleOf, tankMuzzle, type DamageInfo } from "./combat";
import { PlaneRig, RigAssets, SoldierRig, TankRig } from "./rigs";
import {
  ballisticPitch,
  fireCoax,
  fireTankGun,
  forward,
  updatePlaneAI,
  updateSoldierAI,
  updateTankAI,
  type AiContext,
} from "./ai";
import {
  BARREL_MAX,
  BARREL_MIN,
  MODULE_LABEL,
  PLANE_MAX_SPEED,
  PLANE_STALL_SPEED,
  SHELLS,
  STANCE_EYE,
  STANCE_SPEED,
  TANK_ACCEL,
  TANK_GUN_Y,
  TANK_MAX_SPEED,
  TANK_REVERSE_SPEED,
  TANK_TURN_RATE,
  TANK_TURRET,
  TEAM_COLOR,
  TURRET_TRAVERSE,
  WEAPONS,
  callsign,
  enemyOf,
  makePlane,
  makeSoldier,
  makeTank,
  type ClassId,
  type Plane,
  type ShellType,
  type Soldier,
  type Tank,
  type TankModule,
  type Team,
  type Unit,
} from "./units";
import { classById, equipSoldier, squadClassFor, weaponCategory } from "./eras";
import { angleDelta, approachAngle, clamp, mulberry32, range } from "./random";

/* ---------------- HUD contract ---------------- */

export type HudZone = {
  id: string;
  name: string;
  owner: Team | null;
  /** -1 fully red, +1 fully blue. */
  progress: number;
  contested: boolean;
};

export type HudEvent = { id: number; text: string; kind: "kill" | "info" | "hit"; t: number };

export type MinimapUnit = { x: number; z: number; team: Team; kind: "soldier" | "tank" | "plane"; self?: boolean };

export type HudSnapshot = {
  phase: "briefing" | "playing" | "deploy" | "over";
  mode: "infantry" | "tank" | "plane";
  hp: number;
  stance: string;
  stamina: number;
  className: string;
  /** Every weapon this soldier carries, in loadout-slot order, for the HUD's weapon strip. */
  loadout: { slot: number; name: string; equipped: boolean }[];
  weapon: string;
  ammo: number;
  mags: number;
  grenades: number;
  reload: number | null;
  vehicle: {
    name: string;
    shell: ShellType;
    shellName: string;
    ap: number;
    he: number;
    coax: number;
    reload: number;
    speed: number;
    modules: { id: TankModule; label: string; health: number }[];
    zoom: boolean;
  } | null;
  plane: { throttle: number; speed: number; alt: number; ammo: number; bombs: number; stalling: boolean } | null;
  zones: HudZone[];
  tickets: { blue: number; red: number };
  kills: number;
  deaths: number;
  events: HudEvent[];
  hitMarker: number;
  hitText: string | null;
  damageDirs: number[];
  respawnIn: number;
  winner: Team | null;
  fps: number;
  minimap: MinimapUnit[];
  playerHeading: number;
  prompt: string | null;
  spawnOptions: { tanks: number; planes: number };
  muted: boolean;
  gamepadConnected: boolean;
  paused: boolean;
  aimDistance: number | null;
};

/* ---------------- tuning ---------------- */

const SOLDIER_RADIUS = 0.4;
const SOLDIER_HEIGHT = 1.8;
const TANK_RADIUS = 2.5;
const GRAVITY = 22;
const TICKETS = 320;
const CAPTURE_RATE = 0.055;
const RESPAWN_DELAY = 6;
const BOT_RESPAWN = [9, 16];

const SQUAD_SIZE = 13;
const AI_TANKS = 3;
const AI_PLANES = 1;
const FREE_TANKS = 2;
const FREE_PLANES = 2;

type ZoneState = {
  zone: Zone;
  owner: Team | null;
  progress: number;
  contested: boolean;
};

type PlayerMode = "infantry" | "tank" | "plane";

export class Ironfront {
  readonly canvas: HTMLCanvasElement;
  onSnapshot?: (s: HudSnapshot) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private terrain: Terrain;
  private effects = new Effects();
  readonly audio = new Audio();
  private battle: Battle;
  private assets = new RigAssets();

  private soldiers: Soldier[] = [];
  private tanks: Tank[] = [];
  private planes: Plane[] = [];
  private units: Unit[] = [];
  private soldierRigs = new Map<number, SoldierRig>();
  private tankRigs = new Map<number, TankRig>();
  private planeRigs = new Map<number, PlaneRig>();

  private zones: ZoneState[] = [];
  private banners: THREE.Mesh[] = [];
  private tickets: Record<Team, number> = { blue: TICKETS, red: TICKETS };
  private winner: Team | null = null;

  private treeSlot = new Map<number, { mesh: THREE.InstancedMesh; index: number }>();

  private player!: Soldier;
  private mode: PlayerMode = "infantry";
  private ridingTank: Tank | null = null;
  private ridingPlane: Plane | null = null;
  private aimYaw = 0;
  private aimPitch = 0;
  /** Per-shot camera kick that eases back out, plus idle weapon drift — both
   *  additive on top of the raw mouse-driven aim above, so recoil never
   *  fights the player's own tracking the way mutating `aimYaw` would. */
  private recoilYaw = 0;
  private recoilPitch = 0;
  private swayPhase = 0;
  private effAimYaw = 0;
  private effAimPitch = 0;
  private thirdPerson = false;
  private zoomed = false;
  private aimDistance: number | null = null;

  private keys = new Set<string>();
  private mouseDown = new Set<number>();
  private locked = false;
  private paused = false;
  /** Which mapped gamepad buttons were down last poll, for edge-triggered actions. */
  private gpPrevButtons: boolean[] = [];
  private gpConnected = false;
  private phase: HudSnapshot["phase"] = "briefing";
  private respawnAt = 0;
  /** Kills the player has scored, on foot or in anything they were crewing. */
  private playerKills = 0;
  private reloadWeapon: string | null = null;

  private now = 0;
  private nextId = 1;
  private events: HudEvent[] = [];
  private eventSeq = 1;
  private hitMarker = 0;
  private hitText: string | null = null;
  private hitTextUntil = 0;
  private damage: { dir: number; until: number }[] = [];
  private lastSnapshot = 0;
  private frames = 0;
  private fpsAccum = 0;
  private fps = 0;
  private smokeTimer = 0;

  private sun: THREE.DirectionalLight;
  private sky!: THREE.Mesh;
  private clouds = new THREE.Group();
  private tmpVec = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpObj = new THREE.Object3D();
  private rand: () => number;

  constructor(canvas: HTMLCanvasElement, seed = Math.floor(Math.random() * 1e9)) {
    this.canvas = canvas;
    this.rand = mulberry32(seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x9fc4e0);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.2, 2600);

    // Enough haze for depth, but not so much that the gunner's sight goes blind
    // at 600 m — long shots are the point of having one.
    this.scene.fog = new THREE.Fog(0xb7cbd8, 420, 2300);

    this.terrain = new Terrain(seed);
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.battle = new Battle({
      terrain: this.terrain,
      effects: this.effects,
      audio: this.audio,
      get now() {
        return self.now;
      },
      get listener() {
        return self.camera.position;
      },
      allUnits: () => this.units,
      unitById: (id) => this.units.find((u) => u.id === id),
      applyDamage: (t, a, by, info) => this.applyDamage(t, a, by, info),
      notify: (by, target, info) => this.notify(by, target, info),
    });

    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.buildLights();
    this.buildSky();
    this.scene.add(this.terrain.buildMesh());
    this.buildScenery();
    this.buildZones();
    this.scene.add(this.effects.group);

    this.spawnArmies();
    this.attachEvents();
    this.resize();
  }

  /* ---------------- setup ---------------- */

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x6a6a4a, 1.5));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    this.sun.position.set(160, 300, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -130;
    sc.right = 130;
    sc.top = 130;
    sc.bottom = -130;
    sc.near = 1;
    sc.far = 800;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
  }

  private buildSky() {
    const geo = new THREE.SphereGeometry(2200, 16, 12);
    const count = geo.getAttribute("position").count;
    const pos = geo.getAttribute("position");
    const colors = new Float32Array(count * 3);
    const top = new THREE.Color(0x5f9bd4).convertSRGBToLinear();
    const bottom = new THREE.Color(0xdde6dd).convertSRGBToLinear();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = clamp(Math.pow(clamp(pos.getY(i) / 2200, 0, 1), 0.55), 0, 1);
      c.copy(bottom).lerp(top, t);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // A layer of slab clouds, which mostly matter once you are flying.
    // Cloud slabs, unlit so they stay white from underneath, in a group that
    // follows the camera so the deck looks endless from 300 m up.
    const cloudMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xeef2f6, transparent: true, opacity: 0.72, fog: false }),
      280,
    );
    let n = 0;
    for (let i = 0; i < 70 && n < 280; i++) {
      const cx = range(this.rand, -1500, 1500);
      const cz = range(this.rand, -1500, 1500);
      const cy = range(this.rand, 330, 480);
      const puffs = 2 + Math.floor(this.rand() * 3);
      for (let p = 0; p < puffs && n < 280; p++) {
        this.tmpObj.position.set(cx + range(this.rand, -50, 50), cy + range(this.rand, -10, 10), cz + range(this.rand, -50, 50));
        this.tmpObj.rotation.set(0, this.rand() * Math.PI, 0);
        this.tmpObj.scale.set(range(this.rand, 50, 110), range(this.rand, 8, 16), range(this.rand, 40, 90));
        this.tmpObj.updateMatrix();
        cloudMesh.setMatrixAt(n++, this.tmpObj.matrix);
      }
    }
    cloudMesh.count = n;
    cloudMesh.frustumCulled = false;
    this.clouds.add(cloudMesh);
    this.scene.add(this.clouds);
  }

  private buildScenery() {
    const mat = lowPolyMaterial();

    // Trees, grouped by species so each is one instanced draw.
    const byKind = new Map<string, number[]>();
    this.terrain.trees.forEach((t, i) => {
      const list = byKind.get(t.kind) ?? [];
      list.push(i);
      byKind.set(t.kind, list);
    });
    for (const [kind, indices] of byKind) {
      const inst = new THREE.InstancedMesh(treeGeometry(kind), mat, indices.length);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = true;
      inst.receiveShadow = true;
      indices.forEach((treeIndex, slot) => {
        const t = this.terrain.trees[treeIndex];
        this.tmpObj.position.set(t.x, t.y, t.z);
        this.tmpObj.rotation.set(0, t.rot, 0);
        this.tmpObj.scale.setScalar(t.scale);
        this.tmpObj.updateMatrix();
        inst.setMatrixAt(slot, this.tmpObj.matrix);
        this.treeSlot.set(treeIndex, { mesh: inst, index: slot });
      });
      this.scene.add(inst);
    }

    this.instanceProps(rockGeometry(), mat, this.terrain.rocks, (p) => p.scale);
    this.instanceProps(
      bushGeometry(),
      mat,
      this.terrain.clutter.filter((c) => c.kind === "bush"),
      (p) => p.scale,
    );
    this.instanceProps(
      stumpGeometry(),
      mat,
      this.terrain.clutter.filter((c) => c.kind === "stump"),
      (p) => p.scale,
    );
    this.instanceProps(
      crateGeometry(),
      mat,
      this.terrain.clutter.filter((c) => c.kind === "crate"),
      () => 1,
    );
    this.instanceProps(
      sandbagGeometry(),
      mat,
      this.terrain.clutter.filter((c) => c.kind === "sandbags"),
      () => 1,
    );

    // Buildings: dimensions are quantised so similar houses share a geometry.
    const houses = new Map<string, { w: number; d: number; h: number; list: Prop[] }>();
    for (const c of this.terrain.clutter) {
      if (!c.kind.startsWith("house:")) continue;
      const [, ws, ds, hs] = c.kind.split(":");
      const w = Math.round(parseFloat(ws));
      const d = Math.round(parseFloat(ds));
      const h = Math.round(parseFloat(hs));
      const key = `${w}:${d}:${h}`;
      const entry = houses.get(key) ?? { w, d, h, list: [] };
      entry.list.push(c);
      houses.set(key, entry);
    }
    for (const { w, d, h, list } of houses.values()) {
      this.instanceProps(houseGeometry(w, d, h), mat, list, () => 1);
    }
  }

  private instanceProps(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    props: { x: number; y: number; z: number; rot: number; scale: number }[],
    scaleOf: (p: { scale: number }) => number,
  ) {
    if (props.length === 0) return;
    const inst = new THREE.InstancedMesh(geo, mat, props.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    props.forEach((p, i) => {
      this.tmpObj.position.set(p.x, p.y, p.z);
      this.tmpObj.rotation.set(0, p.rot, 0);
      this.tmpObj.scale.setScalar(scaleOf(p));
      this.tmpObj.updateMatrix();
      inst.setMatrixAt(i, this.tmpObj.matrix);
    });
    this.scene.add(inst);
  }

  private buildZones() {
    const poleGeo = flagpoleGeometry();
    const bannerGeo = bannerGeometry();
    const mat = lowPolyMaterial();
    for (const zone of ZONES) {
      this.zones.push({ zone, owner: null, progress: 0, contested: false });
      const y = this.terrain.heightAt(zone.x, zone.z);
      const pole = new THREE.Mesh(poleGeo, mat);
      pole.position.set(zone.x, y, zone.z);
      pole.castShadow = true;
      this.scene.add(pole);
      const banner = new THREE.Mesh(bannerGeo, new THREE.MeshLambertMaterial({ color: 0xbfbfbf, side: THREE.DoubleSide }));
      banner.position.set(zone.x, y + 7.4, zone.z);
      this.scene.add(banner);
      this.banners.push(banner);

      // A ring on the ground marking the capture radius.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(zone.radius - 1.2, zone.radius, 48),
        new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zone.x, y + 0.25, zone.z);
      this.scene.add(ring);
    }
  }

  /* ---------------- army setup ---------------- */

  private spawnArmies() {
    for (const team of ["blue", "red"] as Team[]) {
      const isPlayerTeam = team === "blue";
      for (let i = 0; i < SQUAD_SIZE; i++) {
        const s = this.makeBot(team, i);
        if (isPlayerTeam && i === 0) {
          // The player takes the first slot on the blue roster.
          s.isPlayer = true;
          s.ai = null;
          s.name = "You";
          this.player = s;
        }
        this.addSoldier(s);
      }
      for (let i = 0; i < AI_TANKS; i++) this.addTank(this.makeBotTank(team));
      for (let i = 0; i < AI_PLANES; i++) this.addPlane(this.makeBotPlane(team));
      for (let i = 0; i < FREE_TANKS; i++) {
        const t = makeTank(this.nextId++, team, this.parkingSpot(team, i, FREE_TANKS), team === "blue" ? Math.PI : 0);
        t.name = `${team === "blue" ? "Anvil" : "Kobra"}-${i + 1}`;
        this.addTank(t);
      }
      for (let i = 0; i < FREE_PLANES; i++) {
        const a = AIRFIELDS[team];
        const p = makePlane(
          this.nextId++,
          team,
          new THREE.Vector3(a.x + (i - 0.5) * 26, 0, a.z),
          a.heading,
        );
        p.pos.y = this.terrain.heightAt(p.pos.x, p.pos.z) + 1.05;
        p.name = `${team === "blue" ? "Kite" : "Falke"}-${i + 1}`;
        this.addPlane(p);
      }
    }
    this.placeAtSpawn(this.player);
    this.aimYaw = this.player.aimYaw;
  }

  /** An apron in front of the depot, well clear of the huts and each other. */
  private parkingSpot(team: Team, i: number, of: number) {
    const b = BASES[team];
    const forward = team === "blue" ? -1 : 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = b.x + (i - (of - 1) / 2) * 16 + (attempt % 3) * 9 - 9;
      const z = b.z + forward * (48 + Math.floor(attempt / 3) * 12);
      const y = this.terrain.heightAt(x, z);
      if (!this.terrain.inObstacle(x, y + 1.2, z, TANK_RADIUS + 1, true)) {
        return new THREE.Vector3(x, y, z);
      }
    }
    const x = b.x + (i - (of - 1) / 2) * 16;
    const z = b.z + forward * 52;
    return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
  }

  private makeBot(team: Team, squadIndex: number): Soldier {
    const id = this.nextId++;
    const s = makeSoldier(id, team, new THREE.Vector3(), false);
    s.name = callsign(id);
    equipSoldier(s, squadClassFor(squadIndex));
    s.ai = {
      state: "advance",
      targetId: null,
      goal: new THREE.Vector3(),
      nextThink: 0,
      nextLos: 0,
      hasLos: false,
      burstUntil: 0,
      burstCooldown: 0,
      zoneId: "B",
      strafe: 0,
      coverUntil: 0,
    };
    this.placeAtSpawn(s);
    return s;
  }

  private makeBotTank(team: Team): Tank {
    const id = this.nextId++;
    const b = BASES[team];
    const x = b.x + range(this.rand, -40, 40);
    const z = b.z + range(this.rand, -20, 20);
    const t = makeTank(id, team, new THREE.Vector3(x, this.terrain.heightAt(x, z), z), team === "blue" ? Math.PI : 0);
    t.ai = {
      state: "advance",
      targetId: null,
      goal: new THREE.Vector3(),
      nextThink: 0,
      nextLos: 0,
      hasLos: false,
      zoneId: "B",
      reverseUntil: 0,
      stuckFor: 0,
      lastPos: t.pos.clone(),
    };
    return t;
  }

  private makeBotPlane(team: Team): Plane {
    const id = this.nextId++;
    const a = AIRFIELDS[team];
    const p = makePlane(id, team, new THREE.Vector3(a.x, this.terrain.heightAt(a.x, a.z) + 220, a.z), a.heading);
    p.onGround = false;
    p.speed = 80;
    p.throttle = 0.8;
    p.ai = { state: "cruise", targetId: null, nextThink: 0, goal: new THREE.Vector3(), pullUntil: 0 };
    return p;
  }

  private addSoldier(s: Soldier) {
    this.soldiers.push(s);
    this.units.push(s);
    const rig = new SoldierRig(this.assets, s.team);
    this.soldierRigs.set(s.id, rig);
    this.scene.add(rig.root);
  }

  private addTank(t: Tank) {
    this.tanks.push(t);
    this.units.push(t);
    const rig = new TankRig(this.assets, t.team);
    this.tankRigs.set(t.id, rig);
    this.scene.add(rig.root);
  }

  private addPlane(p: Plane) {
    this.planes.push(p);
    this.units.push(p);
    const rig = new PlaneRig(this.assets, p.team);
    this.planeRigs.set(p.id, rig);
    this.scene.add(rig.root);
  }

  /** Drop a soldier at their team's base, or on a zone they still hold. */
  private placeAtSpawn(s: Soldier) {
    const held = this.zones.filter((z) => z.owner === s.team);
    let cx: number;
    let cz: number;
    let spread: number;
    if (held.length > 0 && this.rand() < 0.6) {
      const z = held[Math.floor(this.rand() * held.length)];
      cx = z.zone.x;
      cz = z.zone.z;
      spread = z.zone.radius * 0.8;
    } else {
      const b = BASES[s.team];
      // Bias the line of departure towards the fight rather than the tents.
      cx = b.x;
      cz = b.z - Math.sign(b.z) * 30;
      spread = 32;
    }
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = cx + range(this.rand, -spread, spread);
      const z = cz + range(this.rand, -spread, spread);
      if (Math.abs(x) > MAP_HALF - 20 || Math.abs(z) > MAP_HALF - 20) continue;
      const y = this.terrain.heightAt(x, z);
      if (this.terrain.inObstacle(x, y + 1, z, SOLDIER_RADIUS)) continue;
      s.pos.set(x, y, z);
      break;
    }
    s.yaw = Math.atan2(-s.pos.x, -s.pos.z);
    s.aimYaw = s.yaw;
    s.aimPitch = 0;
    s.vel.set(0, 0, 0);
  }

  /* ---------------- events ---------------- */

  private attachEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("wheel", this.onWheel, { passive: false });
    document.addEventListener("pointerlockchange", this.onPointerLock);
    window.addEventListener("blur", this.onBlur);
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onBlur = () => {
    this.keys.clear();
    this.mouseDown.clear();
  };

  private onPointerLock = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked && this.phase === "playing") this.paused = true;
  };

  private onResize = () => this.resize();

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const code = e.code;
    this.keys.add(code);
    if (code === "Escape") {
      this.setPaused(!this.paused);
      return;
    }
    if (this.phase !== "playing" || this.paused) return;
    this.performKeyAction(code);
  };

  /**
   * The discrete (press-once) actions bound to a key code. Shared by the
   * keyboard handler above and the gamepad poller below, so a controller
   * button and its keyboard equivalent always do exactly the same thing.
   */
  private performKeyAction(code: string) {
    switch (code) {
      case "KeyV":
        this.thirdPerson = !this.thirdPerson;
        break;
      case "KeyF":
        this.toggleVehicle();
        break;
      case "KeyR":
        if (this.mode === "infantry") this.reloadPlayer();
        break;
      case "KeyZ":
        if (this.mode === "infantry") this.player.stance = this.player.stance === "prone" ? "stand" : "prone";
        break;
      case "KeyC":
        if (this.mode === "infantry") this.player.stance = this.player.stance === "crouch" ? "stand" : "crouch";
        break;
      case "KeyG":
        if (this.mode === "infantry") this.throwGrenade();
        break;
      case "KeyB":
        if (this.mode === "plane") this.dropBomb();
        break;
      case "KeyM":
        this.audio.setMuted(!this.audio.muted);
        break;
      case "Digit1":
        if (this.mode === "infantry") this.switchWeapon(0);
        else if (this.mode === "tank" && this.ridingTank) this.selectShell(this.ridingTank, "ap");
        break;
      case "Digit2":
        if (this.mode === "infantry") this.switchWeapon(1);
        else if (this.mode === "tank" && this.ridingTank) this.selectShell(this.ridingTank, "he");
        break;
      case "Digit3":
        if (this.mode === "infantry") this.switchWeapon(2);
        break;
      default:
        break;
    }
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.audio.resume();
    if (this.phase === "playing" && !this.locked && !this.paused) {
      void this.canvas.requestPointerLock();
      return;
    }
    this.mouseDown.add(e.button);
    if (e.button === 2 && this.mode === "tank") this.zoomed = !this.zoomed;
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseDown.delete(e.button);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.paused) return;
    const sens = this.zoomed ? 0.0007 : 0.0022;
    if (this.mode === "plane") {
      this.aimYaw += e.movementX * 0.0016;
      this.aimPitch += e.movementY * 0.0016;
      this.aimYaw = clamp(this.aimYaw, -1.2, 1.2);
      this.aimPitch = clamp(this.aimPitch, -1.2, 1.2);
      return;
    }
    this.aimYaw -= e.movementX * sens;
    this.aimPitch = clamp(this.aimPitch - e.movementY * sens, -1.35, 1.35);
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode === "plane" || !this.locked) return;
    e.preventDefault();
  };

  /* ---------------- gamepad ---------------- */

  /**
   * A controller is treated as a second input source feeding the exact same
   * state mouse and keyboard already drive: held buttons flow into `keys` /
   * `mouseDown` (so every continuous check downstream — movement, firing,
   * the tank's coaxial hold — needs no gamepad-aware branch of its own), and
   * fresh presses call `performKeyAction` with the keyboard code they stand
   * in for. Only aiming needed its own logic, since a stick has no direct
   * mouse-delta equivalent.
   */
  private pollGamepad(dt: number) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (!gp) {
      this.gpConnected = false;
      return;
    }
    this.gpConnected = true;
    const dead = 0.18;
    const axis = (v: number) => (Math.abs(v) < dead ? 0 : v);
    const lx = axis(gp.axes[0] ?? 0);
    const ly = axis(gp.axes[1] ?? 0);
    const rx = axis(gp.axes[2] ?? 0);
    const ry = axis(gp.axes[3] ?? 0);
    const held = (i: number) => gp.buttons[i]?.pressed ?? false;

    // Left stick: synthesized into WASD, so movement code never needs to
    // know whether a key or a stick asked for it.
    this.setKey("KeyW", ly < 0);
    this.setKey("KeyS", ly > 0);
    this.setKey("KeyA", lx < 0);
    this.setKey("KeyD", lx > 0);
    // A = jump, L3 = sprint (held), C = coax hold in a tank.
    this.setKey("Space", held(0));
    this.setKey("ShiftLeft", held(10));
    this.setKey("KeyC", held(1));

    // RT = fire, held like a mouse button; LT = ADS, mode-dependent because
    // the mouse itself treats it differently per mode (infantry holds it,
    // the tank sight is a click-toggle).
    if (held(7)) this.mouseDown.add(0);
    else this.mouseDown.delete(0);
    if (this.mode === "infantry") {
      if (held(6)) this.mouseDown.add(2);
      else this.mouseDown.delete(2);
    }

    // Right stick: infantry/tank treat aimYaw/aimPitch as a persistent look
    // direction, so the stick accumulates onto it at a fixed rate, the same
    // way repeated mousemove deltas do. A plane treats those fields as a
    // live control-stick deflection that recentres itself every frame (see
    // controlPlane), so the stick sets them directly instead.
    if (this.mode === "plane") {
      if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
        this.aimYaw = clamp(rx * 1.2, -1.2, 1.2);
        this.aimPitch = clamp(ry * 1.2, -1.2, 1.2);
      }
    } else {
      const rate = this.zoomed ? 0.9 : 2.6;
      this.aimYaw -= rx * rate * dt;
      this.aimPitch = clamp(this.aimPitch - ry * rate * dt, -1.35, 1.35);
    }

    // Everything else is a one-shot press: fire only on the rising edge, and
    // route through the same code path a keyboard press would take.
    const edge = (i: number, code: string) => {
      const now = held(i);
      if (now && !this.gpPrevButtons[i]) this.fireGamepadAction(code);
      this.gpPrevButtons[i] = now;
    };
    edge(9, "Escape"); // Start
    edge(8, "KeyV"); // Back/Select — third person
    edge(2, "KeyR"); // X
    edge(3, "KeyZ"); // Y — prone
    edge(1, "KeyC"); // B — crouch (also the held coax check above)
    edge(4, "KeyG"); // LB — grenade
    edge(5, "KeyF"); // RB — enter/exit vehicle, always: a tank driver still needs a way out
    edge(11, "RStick"); // Right stick click — tank gunner's sight toggle
    edge(12, "Digit1"); // D-pad up
    edge(14, "Digit2"); // D-pad left
    edge(15, "Digit3"); // D-pad right
    edge(13, "KeyB"); // D-pad down — drop bomb
  }

  private setKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  /** Routes one gamepad press through the same handling a keyboard press gets. */
  private fireGamepadAction(code: string) {
    if (code === "Escape") {
      this.setPaused(!this.paused);
      return;
    }
    if (this.phase !== "playing" || this.paused) return;
    if (code === "RStick") {
      if (this.mode === "tank") this.zoomed = !this.zoomed;
      return;
    }
    this.performKeyAction(code);
  }

  /* ---------------- public API ---------------- */

  /** Begin rendering. The match itself does not start until `deploy` is called. */
  start() {
    this.paused = false;
    this.loop();
  }

  setPaused(paused: boolean) {
    if (this.phase === "briefing" || this.phase === "over") return;
    this.paused = paused;
    if (paused) document.exitPointerLock();
    else void this.canvas.requestPointerLock();
  }

  setMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  /** Called from the deploy screen. `classId`/`primaryWeapon` only matter for infantry. */
  deploy(as: PlayerMode, classId: ClassId = "rifleman", primaryWeapon?: string) {
    if (this.phase !== "deploy" && this.phase !== "briefing") return;
    this.leaveVehicle(false);
    this.player.alive = true;
    this.player.hp = 100;
    this.player.stamina = 100;
    this.player.stance = "stand";
    equipSoldier(this.player, classId, primaryWeapon);
    this.player.reloadUntil = 0;
    this.reloadWeapon = null;
    this.placeAtSpawn(this.player);
    this.aimYaw = this.player.aimYaw;
    this.aimPitch = 0;
    this.mode = "infantry";

    if (as === "tank") {
      const t = this.freeVehicle("tank") as Tank | null;
      if (t) {
        this.player.pos.set(t.pos.x, t.pos.y, t.pos.z + 4);
        this.enterTank(t);
      }
    } else if (as === "plane") {
      const p = this.freeVehicle("plane") as Plane | null;
      if (p) {
        this.player.pos.set(p.pos.x, p.pos.y, p.pos.z);
        this.enterPlane(p);
      }
    }
    this.phase = "playing";
    if (!this.paused) void this.canvas.requestPointerLock();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
    window.removeEventListener("blur", this.onBlur);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    for (const rig of this.soldierRigs.values()) rig.dispose();
    for (const rig of this.tankRigs.values()) rig.dispose();
    for (const rig of this.planeRigs.values()) rig.dispose();
    this.effects.dispose();
    this.assets.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.effects.setViewportScale(h * Math.min(window.devicePixelRatio, 2), this.camera.fov);
  }

  /* ---------------- main loop ---------------- */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    this.frames++;
    this.fpsAccum += dt;
    if (this.fpsAccum > 0.5) {
      this.fps = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
    }

    if (!this.paused && this.phase !== "briefing" && this.phase !== "over") {
      this.now += dt;
      this.effects.beginFrame();
      this.step(dt);
      this.effects.update(dt);
    } else {
      this.effects.beginFrame();
      this.effects.update(0);
    }

    this.updateRigs(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.emit(dt);
  };

  private step(dt: number) {
    if (this.phase === "playing") {
      this.pollGamepad(dt);
      this.controlPlayer(dt);
    }

    const ctx: AiContext = {
      terrain: this.terrain,
      battle: this.battle,
      now: this.now,
      units: this.units,
      objectiveFor: (team) => this.objectiveFor(team),
      skill: 0.55,
    };

    for (const s of this.soldiers) {
      if (!s.alive || s.ridingId !== null) continue;
      if (s.ai) updateSoldierAI(s, ctx, dt);
      this.moveSoldier(s, dt);
    }
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (t.ai) updateTankAI(t, ctx, dt);
      this.moveTank(t, dt);
    }
    for (const p of this.planes) {
      if (!p.alive) continue;
      if (p.ai) updatePlaneAI(p, ctx, dt);
      this.movePlane(p, dt);
    }

    this.battle.update(dt);
    this.updateZones(dt);
    this.updateRespawns(dt);
    this.updateAmbience(dt);
    this.updateFallingTrees(dt);

    if (this.hitMarker > 0) this.hitMarker -= dt;
    this.damage = this.damage.filter((d) => d.until > this.now);
    if (this.now > this.hitTextUntil) this.hitText = null;

    if (this.winner === null) {
      for (const team of ["blue", "red"] as Team[]) {
        if (this.tickets[team] <= 0) {
          this.winner = enemyOf(team);
          this.phase = "over";
          document.exitPointerLock();
        }
      }
    }
  }

  /* ---------------- player control ---------------- */

  private controlPlayer(dt: number) {
    if (!this.player.alive) return;
    if (this.mode === "tank" && this.ridingTank) this.controlTank(this.ridingTank, dt);
    else if (this.mode === "plane" && this.ridingPlane) this.controlPlane(this.ridingPlane, dt);
    else this.controlInfantry(dt);
  }

  private controlInfantry(dt: number) {
    const s = this.player;
    this.settleReload();
    this.updateRecoilAndSway(dt, s);
    s.aimYaw = this.effAimYaw;
    s.aimPitch = this.effAimPitch;

    let fx = 0;
    let fz = 0;
    if (this.keys.has("KeyW")) fz += 1;
    if (this.keys.has("KeyS")) fz -= 1;
    if (this.keys.has("KeyA")) fx -= 1;
    if (this.keys.has("KeyD")) fx += 1;
    const moving = fx !== 0 || fz !== 0;

    const wantSprint = this.keys.has("ShiftLeft") && fz > 0 && s.stance === "stand" && s.stamina > 3;
    s.sprinting = wantSprint;
    s.stamina = clamp(s.stamina + (wantSprint ? -18 : 11) * dt, 0, 100);
    if (s.stamina <= 0) s.sprinting = false;

    let speed = STANCE_SPEED[s.stance] * (s.sprinting ? 1.65 : 1);
    if (this.zoomed) speed *= 0.6;
    if (fz < 0) speed *= 0.75;

    if (moving) {
      const len = Math.hypot(fx, fz);
      const dirX = (Math.sin(s.aimYaw) * fz + Math.cos(s.aimYaw) * fx) / len;
      const dirZ = (Math.cos(s.aimYaw) * fz - Math.sin(s.aimYaw) * fx) / len;
      s.vel.x = dirX * speed;
      s.vel.z = dirZ * speed;
      s.gait += dt * speed * 1.5;
    } else {
      s.vel.x *= 1 - Math.min(1, dt * 12);
      s.vel.z *= 1 - Math.min(1, dt * 12);
    }
    s.yaw = approachAngle(s.yaw, s.aimYaw, dt * 12);

    if (this.keys.has("Space") && s.onGround && s.stance === "stand") {
      s.vel.y = 6.4;
      s.onGround = false;
    }

    // Sprinting soldiers cannot shoot; everyone else can.
    const spec = WEAPONS[s.weapon];
    const wantFire = this.mouseDown.has(0) && !s.sprinting;
    if (wantFire && this.now >= s.reloadUntil && this.now >= s.nextShotAt) {
      if (s.ammo[s.weapon] > 0) {
        this.fireInfantry(s);
        if (!spec.auto) this.mouseDown.delete(0);
      } else {
        this.reloadPlayer();
      }
    }
    this.zoomed = this.mouseDown.has(2);

    // Single-shot weapons (the AT launcher, marksman-style bolt actions with
    // an empty chamber) auto-reload rather than sitting empty in your hands.
    const equippedSpec = WEAPONS[s.weapon];
    if (equippedSpec.magazine === 1 && s.ammo[s.weapon] === 0 && s.mags[s.weapon] > 0 && this.now >= s.reloadUntil) {
      this.reloadPlayer();
    }
  }

  /** Equip the weapon in loadout slot `slot`, if the soldier carries one there. */
  private switchWeapon(slot: number) {
    const id = this.player.loadout[slot];
    if (id) this.player.weapon = id;
  }

  /**
   * Decays the recoil kick from previous shots and advances idle sway, then
   * combines both with the raw mouse-driven aim into `effAimYaw/effAimPitch`
   * — what firing direction and the camera actually use this frame.
   */
  private updateRecoilAndSway(dt: number, s: Soldier) {
    const spec = WEAPONS[s.weapon];
    const recover = spec.recoilRecover ?? 5;
    this.recoilYaw *= Math.max(0, 1 - recover * dt);
    this.recoilPitch *= Math.max(0, 1 - recover * dt);

    this.swayPhase += dt;
    const sprinting = s.sprinting;
    const swayBase = (spec.swayAmount ?? 0.006) * (this.zoomed ? spec.adsSwayMul ?? 0.4 : 1) * (sprinting ? 0 : 1);
    const swayYaw = Math.sin(this.swayPhase * 1.15) * swayBase;
    const swayPitch = Math.sin(this.swayPhase * 1.47 + 1.1) * swayBase * 0.6;

    this.effAimYaw = this.aimYaw + this.recoilYaw + swayYaw;
    this.effAimPitch = clamp(this.aimPitch + this.recoilPitch + swayPitch, -1.35, 1.35);
  }

  private fireInfantry(s: Soldier) {
    const spec = WEAPONS[s.weapon];
    s.ammo[s.weapon]--;
    s.nextShotAt = this.now + 60 / spec.rpm;
    s.flash = 0.05;
    const kick = spec.recoilKick ?? 0.02;
    this.recoilPitch += kick * (0.75 + Math.random() * 0.5);
    this.recoilYaw += (Math.random() - 0.5) * kick * 0.5;
    muzzleOf(s, this.tmpVec);
    const cp = Math.cos(s.aimPitch);
    this.tmpVec2.set(Math.sin(s.aimYaw) * cp, Math.sin(s.aimPitch), Math.cos(s.aimYaw) * cp).normalize();
    // Standing and moving both cost accuracy; lying still is worth a lot.
    const moveScale = Math.hypot(s.vel.x, s.vel.z) > 0.5 ? 2.4 : 1;
    const stanceScale = s.stance === "prone" ? 0.4 : s.stance === "crouch" ? 0.7 : 1;
    const aimScale = this.zoomed ? 0.45 : 1;
    this.battle.fire({
      kind: weaponCategory(s.weapon) === "heavy" ? "rocket" : "bullet",
      weapon: s.weapon,
      from: this.tmpVec,
      dir: this.tmpVec2,
      ownerId: s.id,
      team: s.team,
      spread: spec.spread * moveScale * stanceScale * aimScale,
    });
    this.battle.suppressNear(this.tmpVec, s.team, 5, 8);
  }

  private reloadPlayer() {
    const s = this.player;
    const spec = WEAPONS[s.weapon];
    if (this.now < s.reloadUntil) return;
    if (s.ammo[s.weapon] >= spec.magazine || s.mags[s.weapon] <= 0) return;
    s.mags[s.weapon]--;
    s.reloadUntil = this.now + spec.reloadTime;
    this.reloadWeapon = s.weapon;
    this.audio.reload();
  }

  /** Finish a reload that the clock has caught up with. */
  private settleReload() {
    if (!this.reloadWeapon || this.now < this.player.reloadUntil) return;
    const weapon = this.reloadWeapon;
    this.player.ammo[weapon] = WEAPONS[weapon].magazine;
    this.reloadWeapon = null;
  }

  private throwGrenade() {
    const s = this.player;
    if (s.grenades <= 0 || this.now < s.reloadUntil) return;
    s.grenades--;
    muzzleOf(s, this.tmpVec);
    const cp = Math.cos(s.aimPitch);
    this.tmpVec2.set(Math.sin(s.aimYaw) * cp, Math.sin(s.aimPitch) + 0.32, Math.cos(s.aimYaw) * cp).normalize();
    this.battle.fire({
      kind: "grenade",
      weapon: "grenade",
      from: this.tmpVec,
      dir: this.tmpVec2,
      ownerId: s.id,
      team: s.team,
      speedScale: 1.4,
    });
    s.nextShotAt = this.now + 0.9;
  }

  private selectShell(t: Tank, shell: ShellType) {
    if (t.shell === shell) return;
    t.shell = shell;
    // Swapping shells mid-reload costs you the rest of the cycle.
    t.reloadUntil = Math.max(t.reloadUntil, this.now + 1.6);
    this.audio.ui(520);
  }

  private controlTank(t: Tank, dt: number) {
    const engine = t.modules.engine / 100;
    const tracks = t.modules.tracks / 100;
    const driver = t.modules.driver / 100;

    let throttle = 0;
    if (this.keys.has("KeyW")) throttle += 1;
    if (this.keys.has("KeyS")) throttle -= 1;
    let steer = 0;
    if (this.keys.has("KeyA")) steer -= 1;
    if (this.keys.has("KeyD")) steer += 1;
    const braking = this.keys.has("Space");

    const maxFwd = TANK_MAX_SPEED * (0.4 + 0.6 * engine) * (0.3 + 0.7 * tracks);
    const target = throttle > 0 ? maxFwd * throttle : TANK_REVERSE_SPEED * throttle;
    const accel = TANK_ACCEL * (0.35 + 0.65 * engine);
    if (braking) t.speed += clamp(-t.speed, -accel * 3 * dt, accel * 3 * dt);
    else if (throttle !== 0) t.speed += clamp(target - t.speed, -accel * 2.4 * dt, accel * dt);
    else t.speed *= 1 - Math.min(1, dt * 1.1);

    // Neutral steering when stopped, wider arcs at speed. Broken tracks pull.
    const speedFactor = 0.45 + 0.55 * Math.min(1, Math.abs(t.speed) / (TANK_MAX_SPEED * 0.6));
    t.yaw -= steer * TANK_TURN_RATE * dt * speedFactor * tracks * (0.5 + 0.5 * driver);

    this.aimTankGun(t, dt);

    if (this.mouseDown.has(0) && this.now >= t.reloadUntil && t.modules.gunner > 15) {
      fireTankGun(t, this.aiContext());
      this.shake(0.5);
    }
    if (this.keys.has("KeyC") && this.now >= t.nextCoaxAt) {
      fireCoax(t, this.aiContext(), 100);
    }
  }

  /**
   * The player's turret chases the crosshair, elevating for range the way a
   * ranged sight does. It never snaps: traverse is a real, slow rate.
   */
  private aimTankGun(t: Tank, dt: number) {
    const gunner = t.modules.gunner / 100;
    const originX = t.pos.x + Math.sin(t.yaw) * TANK_TURRET.z;
    const originZ = t.pos.z + Math.cos(t.yaw) * TANK_TURRET.z;
    const originY = t.pos.y + TANK_GUN_Y;

    // Where is the crosshair pointing? Ray out from the camera to find range.
    const dist = this.aimDistance ?? 800;
    const cp = Math.cos(this.aimPitch);
    this.tmpVec.set(
      this.camera.position.x + Math.sin(this.aimYaw) * cp * dist,
      this.camera.position.y + Math.sin(this.aimPitch) * dist,
      this.camera.position.z + Math.cos(this.aimYaw) * cp * dist,
    );

    const flat = Math.hypot(this.tmpVec.x - originX, this.tmpVec.z - originZ);
    const wantYaw = Math.atan2(this.tmpVec.x - originX, this.tmpVec.z - originZ);
    const solved = ballisticPitch(flat, this.tmpVec.y - originY, WEAPONS.cannon.speed);
    const wantPitch = solved ?? Math.atan2(this.tmpVec.y - originY, flat);

    const traverse = TURRET_TRAVERSE * (0.3 + 0.7 * gunner) * dt;
    t.turret = approachAngle(t.turret, angleDelta(t.yaw, wantYaw), traverse);
    const elevate = 0.32 * (0.3 + 0.7 * gunner) * dt;
    t.barrel = clamp(t.barrel + clamp(wantPitch - t.barrel, -elevate, elevate), BARREL_MIN, BARREL_MAX);
  }

  private controlPlane(p: Plane, dt: number) {
    if (this.keys.has("KeyW")) p.throttle = clamp(p.throttle + dt * 0.6, 0, 1);
    if (this.keys.has("KeyS")) p.throttle = clamp(p.throttle - dt * 0.6, 0, 1);

    let rudder = 0;
    if (this.keys.has("KeyA")) rudder -= 1;
    if (this.keys.has("KeyD")) rudder += 1;

    // Mouse offset from centre is a control deflection, and it recentres itself.
    const authority = clamp(p.speed / 60, 0.15, 1.4);
    this.tmpQuat.setFromAxisAngle(_AXIS_Z, -this.aimYaw * 2.1 * authority * dt);
    p.quat.multiply(this.tmpQuat);
    this.tmpQuat.setFromAxisAngle(_AXIS_X, this.aimPitch * 1.7 * authority * dt);
    p.quat.multiply(this.tmpQuat);
    this.tmpQuat.setFromAxisAngle(_AXIS_Y, -rudder * 0.7 * authority * dt);
    p.quat.multiply(this.tmpQuat);
    p.quat.normalize();
    this.aimYaw *= 1 - Math.min(1, dt * 2.2);
    this.aimPitch *= 1 - Math.min(1, dt * 2.2);

    if (this.mouseDown.has(0) && this.now >= p.nextShotAt && p.ammo > 0) {
      p.ammo--;
      p.nextShotAt = this.now + 60 / WEAPONS.aircannon.rpm;
      p.flash = 0.05;
      forward(p, this.tmpVec2);
      this.tmpVec.copy(p.pos).addScaledVector(this.tmpVec2, 3);
      this.battle.fire({
        kind: "bullet",
        weapon: "aircannon",
        from: this.tmpVec,
        dir: this.tmpVec2,
        ownerId: p.id,
        team: p.team,
        inheritVel: p.vel,
      });
    }
  }

  private dropBomb() {
    const p = this.ridingPlane;
    if (!p || p.bombs <= 0) return;
    p.bombs--;
    forward(p, this.tmpVec2);
    this.tmpVec.copy(p.pos).addScaledVector(this.tmpVec2, 1).setY(p.pos.y - 1.4);
    this.battle.fire({
      kind: "bomb",
      weapon: "bomb",
      from: this.tmpVec,
      dir: this.tmpVec2,
      ownerId: p.id,
      team: p.team,
      inheritVel: p.vel,
    });
    this.pushEvent(`Bomb away — ${p.bombs} left`, "info");
  }

  /* ---------------- vehicles ---------------- */

  private nearbyVehicle(): Tank | Plane | null {
    const s = this.player;
    let best: Tank | Plane | null = null;
    let bestD = 9;
    for (const v of [...this.tanks, ...this.planes] as (Tank | Plane)[]) {
      if (!v.alive || v.team !== s.team || v.ai !== null) continue;
      if (v.kind === "tank" ? v.driverId !== null : v.pilotId !== null) continue;
      const d = s.pos.distanceTo(v.pos);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  private toggleVehicle() {
    if (this.mode !== "infantry") {
      this.leaveVehicle(true);
      return;
    }
    const v = this.nearbyVehicle();
    if (!v) return;
    if (v.kind === "tank") this.enterTank(v);
    else this.enterPlane(v);
  }

  private enterTank(t: Tank) {
    t.driverId = this.player.id;
    t.isPlayer = true;
    this.player.ridingId = t.id;
    this.ridingTank = t;
    this.mode = "tank";
    this.aimYaw = t.yaw + t.turret;
    this.aimPitch = 0.05;
    this.pushEvent(`Crewed ${t.name} — ${SHELLS[t.shell].name} loaded`, "info");
    this.audio.ui(420);
  }

  private enterPlane(p: Plane) {
    p.pilotId = this.player.id;
    p.isPlayer = true;
    this.player.ridingId = p.id;
    this.ridingPlane = p;
    this.mode = "plane";
    this.aimYaw = 0;
    this.aimPitch = 0;
    this.pushEvent(`In the cockpit of ${p.name} — W to throttle up`, "info");
    this.audio.ui(420);
  }

  private leaveVehicle(placeBeside: boolean) {
    const v = this.ridingTank ?? this.ridingPlane;
    if (!v) return;
    if (this.ridingPlane && this.ridingPlane.pos.y - this.terrain.heightAt(this.ridingPlane.pos.x, this.ridingPlane.pos.z) > 4) {
      this.pushEvent("Land before you climb out", "info");
      return;
    }
    if (this.ridingTank) {
      this.ridingTank.driverId = null;
      this.ridingTank.isPlayer = false;
    }
    if (this.ridingPlane) {
      this.ridingPlane.pilotId = null;
      this.ridingPlane.isPlayer = false;
      this.ridingPlane.throttle = 0;
    }
    if (placeBeside) {
      const side = v.kind === "tank" ? v.yaw + Math.PI / 2 : 0;
      const x = v.pos.x + Math.sin(side) * 4;
      const z = v.pos.z + Math.cos(side) * 4;
      this.player.pos.set(x, this.terrain.heightAt(x, z), z);
      this.aimYaw = v.kind === "tank" ? v.yaw : this.aimYaw;
      this.aimPitch = 0;
    }
    this.player.ridingId = null;
    this.ridingTank = null;
    this.ridingPlane = null;
    this.mode = "infantry";
    this.zoomed = false;
  }

  private freeVehicle(kind: "tank" | "plane"): Tank | Plane | null {
    const pool: (Tank | Plane)[] = kind === "tank" ? this.tanks : this.planes;
    for (const v of pool) {
      if (v.team !== this.player.team || v.ai !== null || !v.alive) continue;
      if (v.kind === "tank" ? v.driverId !== null : v.pilotId !== null) continue;
      return v;
    }
    return null;
  }

  private countFree(kind: "tank" | "plane") {
    const pool: (Tank | Plane)[] = kind === "tank" ? this.tanks : this.planes;
    return pool.filter(
      (v) =>
        v.team === this.player.team &&
        v.ai === null &&
        v.alive &&
        (v.kind === "tank" ? v.driverId === null : v.pilotId === null),
    ).length;
  }

  /* ---------------- physics ---------------- */

  private moveSoldier(s: Soldier, dt: number) {
    s.vel.y -= GRAVITY * dt;
    s.pos.x += s.vel.x * dt;
    s.pos.z += s.vel.z * dt;
    s.pos.y += s.vel.y * dt;

    // Slopes you cannot climb push you back down.
    const ground = this.terrain.heightAt(s.pos.x, s.pos.z);
    if (s.pos.y <= ground) {
      s.pos.y = ground;
      s.vel.y = 0;
      s.onGround = true;
      const slope = this.terrain.slopeAt(s.pos.x, s.pos.z);
      if (slope > 0.95) {
        const n = this.terrain.normalAt(s.pos.x, s.pos.z, this.tmpVec);
        s.pos.x += n.x * dt * 8;
        s.pos.z += n.z * dt * 8;
      }
    } else {
      s.onGround = false;
    }

    this.resolveCollision(s.pos, SOLDIER_RADIUS, false, SOLDIER_HEIGHT);
    s.pos.x = clamp(s.pos.x, -MAP_HALF + 6, MAP_HALF - 6);
    s.pos.z = clamp(s.pos.z, -MAP_HALF + 6, MAP_HALF - 6);

    // Being run over by a tank is fatal, as it should be.
    for (const t of this.tanks) {
      if (!t.alive || Math.abs(t.speed) < 1.5) continue;
      if (t.pos.distanceTo(s.pos) < 2.6) {
        this.applyDamage(s, 120, t.driverId ?? t.id, {
          weapon: "cannon",
          result: "hit",
          point: s.pos.clone(),
        });
      }
    }
  }

  private moveTank(t: Tank, dt: number) {
    const fx = Math.sin(t.yaw);
    const fz = Math.cos(t.yaw);
    const prevX = t.pos.x;
    const prevZ = t.pos.z;
    t.pos.x += fx * t.speed * dt;
    t.pos.z += fz * t.speed * dt;
    t.odo += Math.abs(t.speed) * dt;

    // Refuse to climb what a tank cannot climb.
    const slope = this.terrain.slopeAt(t.pos.x, t.pos.z);
    if (slope > 0.82) {
      t.pos.x = prevX;
      t.pos.z = prevZ;
      t.speed *= 0.3;
    }

    t.pos.x = clamp(t.pos.x, -MAP_HALF + 10, MAP_HALF - 10);
    t.pos.z = clamp(t.pos.z, -MAP_HALF + 10, MAP_HALF - 10);
    this.resolveCollision(t.pos, TANK_RADIUS, true, 2.4);

    // Push other tanks out of the way rather than clipping through them.
    for (const o of this.tanks) {
      if (o === t || !o.alive) continue;
      const dx = t.pos.x - o.pos.x;
      const dz = t.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 5.4 && d > 0.001) {
        const push = (5.4 - d) * 0.5;
        t.pos.x += (dx / d) * push;
        t.pos.z += (dz / d) * push;
      }
    }

    t.pos.y = this.terrain.heightAt(t.pos.x, t.pos.z);
    // Sit the hull on the ground plane so it leans into the hillside.
    const n = this.terrain.normalAt(t.pos.x, t.pos.z, this.tmpVec);
    const forwardTilt = -(n.x * fx + n.z * fz) / Math.max(0.2, n.y);
    const sideTilt = -(n.x * fz - n.z * fx) / Math.max(0.2, n.y);
    t.pitch += clamp(Math.atan(forwardTilt) - t.pitch, -dt * 2, dt * 2);
    t.roll += clamp(Math.atan(sideTilt) - t.roll, -dt * 2, dt * 2);

    // Dust and flattened trees in the wake.
    if (Math.abs(t.speed) > 3 && Math.random() < dt * 12) {
      this.tmpVec2.set(t.pos.x - fx * 3, t.pos.y + 0.2, t.pos.z - fz * 3);
      this.effects.dust(this.tmpVec2, 1);
    }
    this.crushTrees(t);
  }

  private crushTrees(t: Tank) {
    if (Math.abs(t.speed) < 2) return;
    for (let i = 0; i < this.terrain.trees.length; i++) {
      const tree = this.terrain.trees[i];
      if (tree.falling || tree.fall >= 1) continue;
      if (Math.abs(tree.x - t.pos.x) > 4 || Math.abs(tree.z - t.pos.z) > 4) continue;
      if (Math.hypot(tree.x - t.pos.x, tree.z - t.pos.z) > 3.4) continue;
      tree.falling = true;
      tree.fallDir = Math.atan2(tree.x - t.pos.x, tree.z - t.pos.z);
    }
  }

  private updateFallingTrees(dt: number) {
    for (let i = 0; i < this.terrain.trees.length; i++) {
      const tree = this.terrain.trees[i];
      if (!tree.falling) continue;
      tree.fall = Math.min(1, tree.fall + dt * 1.6);
      if (tree.fall >= 1) tree.falling = false;
      const slot = this.treeSlot.get(i);
      if (!slot) continue;
      const angle = (tree.fall * tree.fall) * (Math.PI / 2) * 0.96;
      this.tmpObj.position.set(tree.x, tree.y, tree.z);
      this.tmpObj.rotation.set(0, tree.rot, 0);
      this.tmpObj.scale.setScalar(tree.scale);
      this.tmpObj.updateMatrix();
      // Tip the trunk over about its base, away from whatever shoved it.
      const tilt = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(Math.cos(tree.fallDir), 0, -Math.sin(tree.fallDir)).normalize(),
        angle,
      );
      const m = new THREE.Matrix4()
        .makeTranslation(tree.x, tree.y, tree.z)
        .multiply(tilt)
        .multiply(new THREE.Matrix4().makeRotationY(tree.rot))
        .multiply(new THREE.Matrix4().makeScale(tree.scale, tree.scale, tree.scale));
      slot.mesh.setMatrixAt(slot.index, m);
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private movePlane(p: Plane, dt: number) {
    forward(p, this.tmpVec);

    if (p.onGround) {
      // Ground roll: wings level, steered by the rudder, until there is
      // enough air over them to fly.
      const heading = Math.atan2(this.tmpVec.x, this.tmpVec.z);
      p.speed += (PLANE_MAX_SPEED * p.throttle * 0.95 - p.speed) * dt * 0.5;
      p.speed *= 1 - Math.min(1, dt * 0.12);
      p.vel.set(Math.sin(heading) * p.speed, 0, Math.cos(heading) * p.speed);
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x = clamp(p.pos.x, -MAP_HALF + 10, MAP_HALF - 10);
      p.pos.z = clamp(p.pos.z, -MAP_HALF + 10, MAP_HALF - 10);
      p.pos.y = this.terrain.heightAt(p.pos.x, p.pos.z) + 1.05;
      if (p.speed > PLANE_STALL_SPEED * 1.35) {
        // Rotate and unstick, with enough clearance that the undercarriage
        // is not still counted as touching the strip next frame.
        p.onGround = false;
        p.quat.setFromEuler(new THREE.Euler(-0.17, heading, 0, "YXZ"));
        p.pos.y += 2.2;
        if (p.isPlayer) this.pushEvent("Airborne — mouse to fly, B to bomb", "info");
      } else {
        p.quat.setFromEuler(new THREE.Euler(0, heading, 0, "YXZ"));
      }
      return;
    }

    // Thrust against drag, plus the speed you trade for height.
    const climbRate = this.tmpVec.y;
    p.speed += (PLANE_MAX_SPEED * p.throttle - p.speed) * dt * 0.32;
    p.speed -= climbRate * 26 * dt;
    p.speed = Math.max(0, p.speed - dt * 1.5);

    p.vel.copy(this.tmpVec).multiplyScalar(p.speed);
    // Below stall the nose drops and lift stops holding you up.
    if (p.speed < PLANE_STALL_SPEED) {
      p.vel.y -= (PLANE_STALL_SPEED - p.speed) * 0.9;
      // A stall drops the nose.
      this.tmpQuat.setFromAxisAngle(_AXIS_X, 0.7 * dt);
      p.quat.multiply(this.tmpQuat);
    }
    p.pos.addScaledVector(p.vel, dt);

    // Turn escapees back towards the fight rather than letting them vanish.
    p.pos.x = clamp(p.pos.x, -MAP_HALF - 400, MAP_HALF + 400);
    p.pos.z = clamp(p.pos.z, -MAP_HALF - 400, MAP_HALF + 400);

    const ground = this.terrain.heightAt(p.pos.x, p.pos.z);
    if (p.pos.y - ground < 1.05) {
      // Touching down is only a landing if it is gentle, level and slow.
      const heavy = p.vel.y < -9;
      const steep = Math.abs(this.tmpVec.y) > 0.28;
      const fast = p.speed > PLANE_MAX_SPEED * 0.62;
      const banked = Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(p.quat).y) < 0.86;
      if (heavy || steep || fast || banked) {
        this.destroyPlane(p, p.pilotId ?? -1, "crashed");
      } else {
        p.onGround = true;
        p.pos.y = ground + 1.05;
        p.speed *= 0.985;
      }
    }
  }

  /** Circle-vs-box pushout, run twice so corners resolve cleanly. */
  private resolveCollision(pos: THREE.Vector3, radius: number, vehicle: boolean, height: number) {
    for (let iter = 0; iter < 2; iter++) {
      let touched = false;
      for (const o of this.terrain.obstacles) {
        if (vehicle && !o.solidToVehicles) continue;
        if (pos.y > o.y + o.hh || pos.y + height < o.y - o.hh) continue;
        const dx = pos.x - o.x;
        const dz = pos.z - o.z;
        if (dx * dx + dz * dz > (o.radius + radius) * (o.radius + radius)) continue;
        const c = Math.cos(-o.rot);
        const s = Math.sin(-o.rot);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        const nx = clamp(lx, -o.hw, o.hw);
        const nz = clamp(lz, -o.hd, o.hd);
        let ox = lx - nx;
        let oz = lz - nz;
        const d2 = ox * ox + oz * oz;
        let push: number;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          if (d >= radius) continue;
          ox /= d;
          oz /= d;
          push = radius - d;
        } else {
          // Centre is inside the box: eject through the nearest face.
          const gapX = o.hw - Math.abs(lx);
          const gapZ = o.hd - Math.abs(lz);
          if (gapX < gapZ) {
            ox = Math.sign(lx) || 1;
            oz = 0;
            push = gapX + radius;
          } else {
            ox = 0;
            oz = Math.sign(lz) || 1;
            push = gapZ + radius;
          }
        }
        const cc = Math.cos(o.rot);
        const ss = Math.sin(o.rot);
        pos.x += (ox * cc - oz * ss) * push;
        pos.z += (ox * ss + oz * cc) * push;
        touched = true;
      }
      if (!touched) break;
    }
  }

  /* ---------------- damage and scoring ---------------- */

  private applyDamage(target: Unit, amount: number, attackerId: number, info: DamageInfo) {
    if (!target.alive || amount <= 0) return;
    if (target.kind === "tank" && info.module) {
      const mod = info.module;
      target.modules[mod] = Math.max(0, target.modules[mod] - (35 + Math.random() * 45));
    }
    target.hp -= amount;

    if (target.id === this.player.id || (this.ridingTank && target.id === this.ridingTank.id) || (this.ridingPlane && target.id === this.ridingPlane.id)) {
      const dir = Math.atan2(info.point.x - this.camera.position.x, info.point.z - this.camera.position.z);
      this.damage.push({ dir, until: this.now + 2.2 });
      this.shake(0.35);
    }

    const attacker = this.units.find((u) => u.id === attackerId);
    if (attacker && attacker.team !== target.team && this.isPlayerUnit(attackerId)) {
      this.hitMarker = 0.35;
      this.audio.hitMarker();
    }

    if (target.hp <= 0) this.kill(target, attackerId, info);
  }

  private isPlayerUnit(id: number) {
    return (
      id === this.player.id ||
      (this.ridingTank !== null && id === this.ridingTank.id) ||
      (this.ridingPlane !== null && id === this.ridingPlane.id)
    );
  }

  private kill(target: Unit, attackerId: number, info: DamageInfo) {
    if (target.kind === "plane") {
      this.destroyPlane(target, attackerId, "shot down");
      return;
    }
    target.alive = false;
    target.hp = 0;
    const attacker = this.units.find((u) => u.id === attackerId);
    const cost = target.kind === "soldier" ? 1 : 6;
    this.tickets[target.team] = Math.max(0, this.tickets[target.team] - cost);

    if (target.kind === "tank") {
      this.effects.explosion(this.tmpVec.copy(target.pos).setY(target.pos.y + 1.4), 9);
      this.audio.explosion(target.pos.distanceTo(this.camera.position), 1.4);
      target.speed = 0;
      if (target.driverId !== null && target.driverId === this.player.id) this.leaveVehicleOnDeath();
      target.driverId = null;
      target.isPlayer = false;
      target.respawnAt = this.now + 28;
    } else {
      target.respawnAt = this.now + range(this.rand, BOT_RESPAWN[0], BOT_RESPAWN[1]);
      target.ridingId = null;
    }

    if (attacker && attacker.team !== target.team) attacker.kills++;
    if (this.isPlayerUnit(attackerId)) this.playerKills++;

    const verb = info.result === "headshot" ? "headshot" : info.result === "penetration" ? "knocked out" : "killed";
    const who = attacker ? attacker.name : "the battlefield";
    this.pushEvent(`${who} ${verb} ${target.name}`, "kill");

    if (this.isPlayerUnit(attackerId)) {
      this.hitText = target.kind === "tank" ? "TARGET DESTROYED" : "ELIMINATED";
      this.hitTextUntil = this.now + 1.6;
      this.audio.hitMarker();
    }

    if (target.id === this.player.id) {
      this.player.deaths++;
      this.phase = "deploy";
      this.respawnAt = this.now + RESPAWN_DELAY;
      document.exitPointerLock();
    }
  }

  private leaveVehicleOnDeath() {
    this.ridingTank = null;
    this.ridingPlane = null;
    this.mode = "infantry";
    this.player.ridingId = null;
    this.player.alive = false;
    this.player.hp = 0;
    this.player.deaths++;
    this.phase = "deploy";
    this.respawnAt = this.now + RESPAWN_DELAY;
    document.exitPointerLock();
  }

  private destroyPlane(p: Plane, attackerId: number, how: string) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.effects.explosion(p.pos, 14);
    this.audio.explosion(p.pos.distanceTo(this.camera.position), 1.6);
    this.tickets[p.team] = Math.max(0, this.tickets[p.team] - 8);
    p.respawnAt = this.now + 32;
    const attacker = this.units.find((u) => u.id === attackerId);
    if (attacker && attacker.team !== p.team) {
      attacker.kills++;
      if (this.isPlayerUnit(attackerId)) this.playerKills++;
    }
    this.pushEvent(`${p.name} ${how}${attacker && attacker.id !== p.id ? ` by ${attacker.name}` : ""}`, "kill");
    if (p.pilotId === this.player.id) {
      p.pilotId = null;
      p.isPlayer = false;
      this.leaveVehicleOnDeath();
    } else {
      p.pilotId = null;
      p.isPlayer = false;
    }
  }

  private notify(attackerId: number, targetId: number, info: DamageInfo) {
    if (!this.isPlayerUnit(attackerId)) {
      // Being bounced yourself is worth knowing about too.
      if (this.isPlayerUnit(targetId) && info.result === "no-penetration") {
        this.hitText = "PLATE HELD";
        this.hitTextUntil = this.now + 1.2;
      }
      return;
    }
    const eff = info.effective ? `${Math.round(info.effective)} mm` : "";
    const pen = info.penetration ? `${Math.round(info.penetration)} mm` : "";
    if (info.result === "ricochet") this.hitText = `RICOCHET — ${eff} effective`;
    else if (info.result === "no-penetration") this.hitText = `NO PENETRATION — ${pen} vs ${eff}`;
    else if (info.result === "penetration") this.hitText = `HIT — ${info.module ? MODULE_LABEL[info.module] : "crew"}`;
    this.hitTextUntil = this.now + 1.8;
    this.hitMarker = 0.35;
  }

  /* ---------------- match flow ---------------- */

  private objectiveFor(team: Team): Zone {
    const base = BASES[team];
    let best = this.zones[0];
    let bestScore = Infinity;
    for (const z of this.zones) {
      const dist = Math.hypot(z.zone.x - base.x, z.zone.z - base.z);
      // Take what is not yours, nearest first; reinforce what is contested.
      const owned = z.owner === team ? 1 : 0;
      const score = dist * (1 + owned * 2.2) - (z.contested ? 60 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = z;
      }
    }
    return best.zone;
  }

  private updateZones(dt: number) {
    let blueHeld = 0;
    let redHeld = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const zs = this.zones[i];
      let blue = 0;
      let red = 0;
      for (const u of this.units) {
        if (!u.alive || u.kind === "plane") continue;
        if (u.kind === "soldier" && u.ridingId !== null) continue;
        const d = Math.hypot(u.pos.x - zs.zone.x, u.pos.z - zs.zone.z);
        if (d > zs.zone.radius) continue;
        const weight = u.kind === "tank" ? 2 : 1;
        if (u.team === "blue") blue += weight;
        else red += weight;
      }
      zs.contested = blue > 0 && red > 0;
      const net = blue - red;
      if (net !== 0 && !zs.contested) {
        const rate = CAPTURE_RATE * Math.min(4, Math.abs(net)) * Math.sign(net);
        const before = zs.progress;
        zs.progress = clamp(zs.progress + rate * dt, -1, 1);
        void before;
        const owner: Team | null = zs.progress >= 1 ? "blue" : zs.progress <= -1 ? "red" : null;
        if (owner !== zs.owner) {
          zs.owner = owner;
          if (owner) {
            this.pushEvent(`${owner === "blue" ? "Blue" : "Red"} has taken ${zs.zone.name}`, "info");
            this.audio.ui(owner === this.player.team ? 720 : 320);
          }
        }
      }
      if (zs.owner === "blue") blueHeld++;
      if (zs.owner === "red") redHeld++;

      const banner = this.banners[i];
      const mat = banner.material as THREE.MeshLambertMaterial;
      const target = zs.owner ? TEAM_COLOR[zs.owner].primary : 0xbfbfbf;
      mat.color.setHex(target);
      banner.rotation.y = Math.sin(this.now * 1.4 + i) * 0.14;
      banner.position.y = this.terrain.heightAt(zs.zone.x, zs.zone.z) + 7.4;
    }

    // Holding more ground bleeds the other side's reinforcements.
    const diff = blueHeld - redHeld;
    if (diff > 0) this.tickets.red = Math.max(0, this.tickets.red - diff * 1.6 * dt);
    if (diff < 0) this.tickets.blue = Math.max(0, this.tickets.blue - -diff * 1.6 * dt);
  }

  private updateRespawns(dt: number) {
    void dt;
    for (const s of this.soldiers) {
      if (s.alive || s.isPlayer) continue;
      if (this.now >= s.respawnAt) {
        s.alive = true;
        s.hp = 100;
        s.stance = "stand";
        s.suppression = 0;
        equipSoldier(s, s.classId);
        s.reloadUntil = 0;
        this.placeAtSpawn(s);
      }
    }
    for (const t of this.tanks) {
      if (t.alive || this.now < t.respawnAt) continue;
      t.alive = true;
      t.hp = 100;
      t.modules = { engine: 100, tracks: 100, gunner: 100, driver: 100, ammo: 100 };
      t.ammo = { ap: 42, he: 24 };
      t.coaxAmmo = WEAPONS.coax.magazine;
      t.speed = 0;
      t.turret = 0;
      t.barrel = 0;
      t.reloadUntil = 0;
      const spot = t.ai
        ? new THREE.Vector3(BASES[t.team].x + range(this.rand, -40, 40), 0, BASES[t.team].z + range(this.rand, -20, 20))
        : this.parkingSpot(t.team, this.tanks.filter((v) => v.team === t.team && v.ai === null).indexOf(t), FREE_TANKS);
      spot.y = this.terrain.heightAt(spot.x, spot.z);
      t.pos.copy(spot);
      t.yaw = t.team === "blue" ? Math.PI : 0;
      if (t.ai) t.ai.lastPos.copy(t.pos);
    }
    for (const p of this.planes) {
      if (p.alive || this.now < p.respawnAt) continue;
      p.alive = true;
      p.hp = 100;
      p.ammo = WEAPONS.aircannon.magazine;
      p.bombs = 2;
      const a = AIRFIELDS[p.team];
      if (p.ai) {
        p.pos.set(a.x, this.terrain.heightAt(a.x, a.z) + 220, a.z);
        p.onGround = false;
        p.speed = 80;
        p.throttle = 0.8;
      } else {
        p.pos.set(a.x, this.terrain.heightAt(a.x, a.z) + 1.05, a.z);
        p.onGround = true;
        p.speed = 0;
        p.throttle = 0;
      }
      p.quat.setFromEuler(new THREE.Euler(0, a.heading, 0, "YXZ"));
    }

    if (this.phase === "deploy" && this.now >= this.respawnAt && this.winner === null) {
      // The deploy screen unlocks; the React layer offers the choices.
    }
  }

  private updateAmbience(dt: number) {
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.12;
      for (const t of this.tanks) {
        if (t.alive) continue;
        if (t.pos.distanceTo(this.camera.position) > 420) continue;
        this.effects.wreckSmoke(this.tmpVec.copy(t.pos).setY(t.pos.y + 1.8));
      }
    }
  }

  private aiContext(): AiContext {
    return {
      terrain: this.terrain,
      battle: this.battle,
      now: this.now,
      units: this.units,
      objectiveFor: (team) => this.objectiveFor(team),
      skill: 0.55,
    };
  }

  /* ---------------- presentation ---------------- */

  private updateRigs(dt: number) {
    const firstPersonTank = this.mode === "tank" && !this.thirdPerson && this.zoomed;
    for (const s of this.soldiers) {
      const rig = this.soldierRigs.get(s.id);
      if (!rig) continue;
      const hidden =
        s.ridingId !== null ||
        (s.isPlayer && (this.mode !== "infantry" || !this.thirdPerson)) ||
        (!s.alive && this.now > s.respawnAt - 3);
      rig.update(s, s.team === this.player.team && !s.isPlayer, hidden);
    }
    for (const t of this.tanks) {
      const rig = this.tankRigs.get(t.id);
      if (!rig) continue;
      rig.update(t, t.team === this.player.team && t.id !== this.ridingTank?.id, firstPersonTank && t.id === this.ridingTank?.id);
    }
    for (const p of this.planes) {
      const rig = this.planeRigs.get(p.id);
      if (!rig) continue;
      rig.update(p, dt, p.team === this.player.team && p.id !== this.ridingPlane?.id, false);
    }
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.clouds.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.sun.position.set(this.camera.position.x + 180, 320, this.camera.position.z + 140);
    this.sun.target.position.copy(this.camera.position);
    this.sun.target.updateMatrixWorld();
  }

  private shakeAmount = 0;

  private shake(amount: number) {
    this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
  }

  /**
   * Pull a chase camera in until it has line of sight to the thing it is
   * following, so reversing into a barn does not black out the screen.
   */
  private pullInCamera(focusX: number, focusY: number, focusZ: number, minDist: number) {
    this.tmpVec.set(this.camera.position.x - focusX, this.camera.position.y - focusY, this.camera.position.z - focusZ);
    const want = this.tmpVec.length();
    if (want < 0.001) return;
    this.tmpVec.divideScalar(want);
    this.tmpVec2.set(focusX, focusY, focusZ);
    const wall = this.terrain.rayObstacle(this.tmpVec2, this.tmpVec, want);
    let dist = want;
    if (wall) dist = Math.max(minDist, wall.t - 0.6);
    // Walk the ray for terrain too: hillsides block just as well as walls.
    for (let d = minDist; d < dist; d += 1.2) {
      const x = focusX + this.tmpVec.x * d;
      const z = focusZ + this.tmpVec.z * d;
      const y = focusY + this.tmpVec.y * d;
      if (this.terrain.heightAt(x, z) + 0.5 > y) {
        dist = Math.max(minDist, d - 1.2);
        break;
      }
    }
    this.camera.position.set(focusX + this.tmpVec.x * dist, focusY + this.tmpVec.y * dist, focusZ + this.tmpVec.z * dist);
  }

  private updateCamera(dt: number) {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.2);

    let fov = 70;
    if (this.mode === "infantry") {
      const zoomMul = WEAPONS[this.player.weapon]?.adsZoom ?? 2.2;
      fov = this.zoomed ? 72 / zoomMul : 72;
      const eye = STANCE_EYE[this.player.stance];
      if (this.thirdPerson) {
        const back = 5.5;
        const cp = Math.cos(this.effAimPitch);
        this.camera.position.set(
          this.player.pos.x - Math.sin(this.effAimYaw) * cp * back + Math.cos(this.effAimYaw) * 1.2,
          this.player.pos.y + eye + 1.4 + Math.sin(this.effAimPitch) * back,
          this.player.pos.z - Math.cos(this.effAimYaw) * cp * back - Math.sin(this.effAimYaw) * 1.2,
        );
        this.pullInCamera(this.player.pos.x, this.player.pos.y + eye, this.player.pos.z, 1.4);
      } else {
        const bob = Math.hypot(this.player.vel.x, this.player.vel.z) > 0.5 ? Math.sin(this.player.gait * 4.8) * 0.045 : 0;
        this.camera.position.set(this.player.pos.x, this.player.pos.y + eye + bob, this.player.pos.z);
      }
      this.applyLook(this.effAimYaw, this.effAimPitch);
    } else if (this.mode === "tank" && this.ridingTank) {
      const t = this.ridingTank;
      if (this.zoomed && !this.thirdPerson) {
        // Gunner's sight: down the barrel, narrow field, no chase lag.
        fov = 12;
        tankMuzzle(t, this.tmpVec);
        const yaw = t.yaw + t.turret;
        this.camera.position.set(
          t.pos.x + Math.sin(t.yaw) * TANK_TURRET.z + Math.sin(yaw) * 1.2,
          t.pos.y + TANK_GUN_Y + 0.25,
          t.pos.z + Math.cos(t.yaw) * TANK_TURRET.z + Math.cos(yaw) * 1.2,
        );
        this.applyLook(this.aimYaw, this.aimPitch);
      } else {
        fov = 62;
        const back = 13;
        const cp = Math.cos(this.aimPitch);
        this.camera.position.set(
          t.pos.x - Math.sin(this.aimYaw) * cp * back,
          t.pos.y + 5.2 + Math.sin(this.aimPitch) * back,
          t.pos.z - Math.cos(this.aimYaw) * cp * back,
        );
        this.pullInCamera(t.pos.x, t.pos.y + 2.6, t.pos.z, 4.5);
        const floor = this.terrain.heightAt(this.camera.position.x, this.camera.position.z) + 1.6;
        if (this.camera.position.y < floor) this.camera.position.y = floor;
        this.applyLook(this.aimYaw, this.aimPitch);
      }
    } else if (this.mode === "plane" && this.ridingPlane) {
      const p = this.ridingPlane;
      fov = 76;
      forward(p, this.tmpVec);
      const up = this.tmpVec2.set(0, 1, 0).applyQuaternion(p.quat);
      this.camera.position
        .copy(p.pos)
        .addScaledVector(this.tmpVec, -16)
        .addScaledVector(up, 4.6);
      this.camera.quaternion.copy(p.quat);
      this.camera.rotateY(Math.PI);
    } else {
      this.applyLook(this.aimYaw, this.aimPitch);
    }

    // A little kick after a shell leaves the barrel.
    if (this.shakeAmount > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount * 0.35;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount * 0.35;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmount * 0.35;
    }

    // Never let the camera sink into the hillside.
    const ground = this.terrain.heightAt(this.camera.position.x, this.camera.position.z) + 0.4;
    if (this.camera.position.y < ground) this.camera.position.y = ground;

    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
      this.effects.setViewportScale(
        (this.canvas.clientHeight || window.innerHeight) * Math.min(window.devicePixelRatio, 2),
        this.camera.fov,
      );
    }

    this.measureAim();
  }

  private applyLook(yaw: number, pitch: number) {
    this.camera.rotation.set(pitch, yaw + Math.PI, 0, "YXZ");
  }

  /** Range to whatever the crosshair is on, used by the sight and the HUD. */
  private measureAim() {
    // Infantry aims along the same effective direction the camera renders
    // (raw mouse plus recoil and sway); other modes have neither, so the raw
    // mouse-driven values are already what the camera shows.
    const yaw = this.mode === "infantry" ? this.effAimYaw : this.aimYaw;
    const pitch = this.mode === "infantry" ? this.effAimPitch : this.aimPitch;
    const cp = Math.cos(pitch);
    this.tmpVec2.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
    if (this.mode === "plane" && this.ridingPlane) forward(this.ridingPlane, this.tmpVec2);
    let best = Infinity;
    const origin = this.camera.position;
    const wall = this.terrain.rayObstacle(origin, this.tmpVec2, 1400);
    if (wall) best = wall.t;
    // Walk the ray down onto the terrain.
    let t = 4;
    while (t < Math.min(best, 1400)) {
      const x = origin.x + this.tmpVec2.x * t;
      const y = origin.y + this.tmpVec2.y * t;
      const z = origin.z + this.tmpVec2.z * t;
      if (this.terrain.heightAt(x, z) > y) {
        best = Math.min(best, t);
        break;
      }
      t += Math.max(3, t * 0.06);
    }
    for (const u of this.units) {
      if (!u.alive || u.team === this.player.team) continue;
      const dx = u.pos.x - origin.x;
      const dy = u.pos.y + 1 - origin.y;
      const dz = u.pos.z - origin.z;
      const along = dx * this.tmpVec2.x + dy * this.tmpVec2.y + dz * this.tmpVec2.z;
      if (along < 5 || along > best) continue;
      const perp = Math.hypot(dx - this.tmpVec2.x * along, dy - this.tmpVec2.y * along, dz - this.tmpVec2.z * along);
      if (perp < (u.kind === "soldier" ? 1.2 : 3)) best = along;
    }
    this.aimDistance = Number.isFinite(best) ? best : null;
  }

  /* ---------------- HUD ---------------- */

  private pushEvent(text: string, kind: HudEvent["kind"]) {
    this.events.push({ id: this.eventSeq++, text, kind, t: this.now });
    if (this.events.length > 40) this.events.shift();
  }

  private emit(dt: number) {
    void dt;
    if (!this.onSnapshot) return;
    if (this.now - this.lastSnapshot < 0.09 && this.phase === "playing") return;
    this.lastSnapshot = this.now;

    const t = this.ridingTank;
    const p = this.ridingPlane;
    const s = this.player;
    const spec = WEAPONS[s.weapon];

    const minimap: MinimapUnit[] = [];
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.kind === "soldier" && u.ridingId !== null) continue;
      // Enemies only show if somebody on your side can actually see them.
      if (u.team !== s.team && !this.spotted(u)) continue;
      minimap.push({
        x: u.pos.x,
        z: u.pos.z,
        team: u.team,
        kind: u.kind,
        self: this.isPlayerUnit(u.id),
      });
    }

    this.onSnapshot({
      phase: this.phase,
      mode: this.mode,
      hp: Math.max(0, Math.round(t ? t.hp : p ? p.hp : s.hp)),
      stance: s.stance,
      stamina: Math.round(s.stamina),
      className: classById(s.classId).name,
      loadout: s.loadout.map((id, slot) => ({ slot, name: WEAPONS[id].name, equipped: id === s.weapon })),
      weapon: t ? SHELLS[t.shell].name : p ? WEAPONS.aircannon.name : spec.name,
      ammo: s.ammo[s.weapon],
      mags: s.mags[s.weapon],
      grenades: s.grenades,
      reload:
        this.mode === "infantry" && this.now < s.reloadUntil
          ? 1 - (s.reloadUntil - this.now) / spec.reloadTime
          : null,
      vehicle: t
        ? {
            name: t.name,
            shell: t.shell,
            shellName: SHELLS[t.shell].name,
            ap: t.ammo.ap,
            he: t.ammo.he,
            coax: t.coaxAmmo,
            reload: this.now >= t.reloadUntil ? 1 : 1 - (t.reloadUntil - this.now) / WEAPONS.cannon.reloadTime,
            speed: Math.abs(t.speed),
            modules: (Object.keys(t.modules) as TankModule[]).map((id) => ({
              id,
              label: MODULE_LABEL[id],
              health: t.modules[id],
            })),
            zoom: this.zoomed,
          }
        : null,
      plane: p
        ? {
            throttle: p.throttle,
            speed: p.speed,
            alt: p.pos.y - this.terrain.heightAt(p.pos.x, p.pos.z),
            ammo: p.ammo,
            bombs: p.bombs,
            stalling: p.speed < PLANE_STALL_SPEED * 1.15 && !p.onGround,
          }
        : null,
      zones: this.zones.map((z) => ({
        id: z.zone.id,
        name: z.zone.name,
        owner: z.owner,
        progress: z.progress,
        contested: z.contested,
      })),
      tickets: { blue: Math.round(this.tickets.blue), red: Math.round(this.tickets.red) },
      kills: this.playerKills,
      deaths: s.deaths,
      events: this.events.slice(-7),
      hitMarker: Math.max(0, this.hitMarker),
      hitText: this.hitText,
      damageDirs: this.damage.map((d) => d.dir - this.aimYaw),
      respawnIn: Math.max(0, this.respawnAt - this.now),
      winner: this.winner,
      fps: this.fps,
      minimap,
      playerHeading: this.mode === "plane" && p ? Math.atan2(forward(p, this.tmpVec).x, this.tmpVec.z) : this.aimYaw,
      prompt: this.promptText(),
      spawnOptions: { tanks: this.countFree("tank"), planes: this.countFree("plane") },
      muted: this.audio.muted,
      gamepadConnected: this.gpConnected,
      paused: this.paused,
      aimDistance: this.aimDistance,
    });
  }

  /** An enemy shows on the minimap only while somebody friendly has eyes on. */
  private spotted(u: Unit) {
    if (u.kind === "plane") return true;
    for (const f of this.units) {
      if (!f.alive || f.team !== this.player.team) continue;
      if (f.kind === "soldier" && f.ridingId !== null) continue;
      const d = f.pos.distanceTo(u.pos);
      if (d > 220) continue;
      if (f.kind === "soldier" && f.ai && f.ai.targetId === u.id && f.ai.hasLos) return true;
      if (f.kind === "tank" && f.ai && f.ai.targetId === u.id && f.ai.hasLos) return true;
      if (this.isPlayerUnit(f.id) && d < 220) {
        this.tmpVec.copy(u.pos).setY(u.pos.y + 1);
        if (!this.terrain.losBlocked(this.camera.position, this.tmpVec)) return true;
      }
    }
    return false;
  }

  private promptText() {
    if (this.mode !== "infantry" || !this.player.alive) return null;
    const v = this.nearbyVehicle();
    if (v) return `[F] Crew ${v.name}`;
    return null;
  }
}

const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _AXIS_Z = new THREE.Vector3(0, 0, 1);
