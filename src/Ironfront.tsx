import { useCallback, useEffect, useRef, useState } from "react";
import { Ironfront as Game, type HudSnapshot, type MinimapUnit } from "@/ironfront/game";
import { PLAYABLE_CLASSES, primaryOptionsFor } from "@/ironfront/eras";
import { MAP_HALF, ZONES } from "@/ironfront/terrain";
import { TEAM_COLOR, WEAPONS, type ClassId } from "@/ironfront/units";
import MatchSetup from "@/MatchSetup";
import { mapById, type MatchSettings } from "@/ironfront/matchConfig";
import { cn } from "@/lib/utils";

/**
 * The HUD. Everything here is a read-only view of a snapshot the simulation
 * pushes out about ten times a second; nothing in React drives the game loop.
 */

const BLUE = TEAM_COLOR.blue.hud;
const RED = TEAM_COLOR.red.hud;

export default function Ironfront() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [showControls, setShowControls] = useState(false);
  // Null until the player commits a setup; that commit is what boots the game.
  const [matchSettings, setMatchSettings] = useState<MatchSettings | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matchSettings) return;
    const game = new Game(canvas, matchSettings);
    gameRef.current = game;
    game.onSnapshot = setHud;
    game.start();
    return () => {
      game.dispose();
      gameRef.current = null;
      setHud(null);
    };
  }, [matchSettings]);

  const [selectedClass, setSelectedClass] = useState<ClassId>(PLAYABLE_CLASSES[0].id);
  // Remembers the last weapon picked per class, so switching classes and back
  // doesn't forget your choice.
  const [primaryByClass, setPrimaryByClass] = useState<Partial<Record<ClassId, string>>>({});
  const selectedPrimary = primaryByClass[selectedClass] ?? primaryOptionsFor(selectedClass)[0];
  const setSelectedPrimary = useCallback(
    (weaponId: string) => setPrimaryByClass((prev) => ({ ...prev, [selectedClass]: weaponId })),
    [selectedClass],
  );

  const deploy = useCallback(
    (as: "infantry" | "tank" | "plane") => {
      gameRef.current?.deploy(as, selectedClass, selectedPrimary);
    },
    [selectedClass, selectedPrimary],
  );

  // Dropping matchSettings tears the running game down (it is the effect's
  // dependency) and puts the setup menu back up. MatchConfig reloads the saved
  // per-map rosters from storage, so the menu reopens exactly as it was left.
  const activeMap = matchSettings ? mapById(matchSettings.mapId) : null;
  const mapName = activeMap?.name ?? "";
  const mapBlurb = activeMap?.blurb ?? "";

  const reopenSetup = useCallback(() => {
    document.exitPointerLock?.();
    setMatchSettings(null);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d1117] font-[JetBrains_Mono,ui-monospace,monospace] text-[#e6e3da] select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!matchSettings && <MatchSetup onStart={setMatchSettings} />}

      {hud && hud.phase === "playing" && <Reticle hud={hud} />}
      {hud && hud.phase === "playing" && <DamageArcs dirs={hud.damageDirs} />}
      {hud && (hud.phase === "playing" || hud.phase === "deploy") && <Objectives hud={hud} />}
      {hud && (hud.phase === "playing" || hud.phase === "deploy") && <Feed events={hud.events} />}
      {hud && hud.phase === "playing" && <Status hud={hud} />}
      {hud && (hud.phase === "playing" || hud.phase === "deploy") && <Minimap hud={hud} />}
      {hud && hud.phase === "playing" && hud.prompt && (
        <div className="pointer-events-none absolute left-1/2 top-[62%] -translate-x-1/2 rounded border border-white/25 bg-black/55 px-3 py-1.5 text-sm tracking-wide">
          {hud.prompt}
        </div>
      )}

      {hud?.phase === "briefing" && (
        <Briefing
          mapName={mapName}
          mapBlurb={mapBlurb}
          onSetup={reopenSetup}
          onDeploy={deploy}
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          selectedPrimary={selectedPrimary}
          onSelectPrimary={setSelectedPrimary}
        />
      )}
      {hud?.phase === "deploy" && (
        <Deploy
          hud={hud}
          onDeploy={deploy}
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          selectedPrimary={selectedPrimary}
          onSelectPrimary={setSelectedPrimary}
        />
      )}
      {hud?.phase === "over" && <Result hud={hud} onSetup={reopenSetup} mapName={mapName} />}
      {hud?.paused && hud.phase === "playing" && (
        <Pause
          hud={hud}
          onResume={() => gameRef.current?.setPaused(false)}
          onControls={() => setShowControls(true)}
          onSetup={reopenSetup}
        />
      )}
      {showControls && <Controls onClose={() => setShowControls(false)} />}

      {hud && (
        <div className="pointer-events-none absolute right-3 top-3 text-[10px] uppercase tracking-[0.2em] text-white/35">
          {hud.fps} fps{hud.muted ? " · muted" : ""}{hud.gamepadConnected ? " · controller" : ""}
        </div>
      )}
    </div>
  );
}

/* ---------------- reticle ---------------- */

function Reticle({ hud }: { hud: HudSnapshot }) {
  const tank = hud.mode === "tank";
  const plane = hud.mode === "plane";
  const range = hud.aimDistance;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative">
        {tank ? (
          <svg width="260" height="260" viewBox="-130 -130 260 260" className="opacity-90">
            {/* Gunner's sight: a stadia rangefinder, the way a period optic reads. */}
            <line x1="-120" y1="0" x2="-16" y2="0" stroke="#f2e7c8" strokeWidth="1.4" />
            <line x1="16" y1="0" x2="120" y2="0" stroke="#f2e7c8" strokeWidth="1.4" />
            <path d="M -14 -8 L 0 4 L 14 -8" fill="none" stroke="#f2e7c8" strokeWidth="1.8" />
            {[1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1={-6 - (i % 2) * 4}
                y1={i * 14}
                x2={6 + (i % 2) * 4}
                y2={i * 14}
                stroke="#f2e7c8"
                strokeWidth="1.1"
                opacity={0.75}
              />
            ))}
            <circle cx="0" cy="0" r="112" fill="none" stroke="#f2e7c8" strokeWidth="0.8" opacity="0.3" />
          </svg>
        ) : plane ? (
          <svg width="200" height="200" viewBox="-100 -100 200 200" className="opacity-85">
            <circle cx="0" cy="0" r="46" fill="none" stroke="#ffe9a8" strokeWidth="1.2" opacity="0.7" />
            <line x1="-72" y1="0" x2="-20" y2="0" stroke="#ffe9a8" strokeWidth="1.6" />
            <line x1="20" y1="0" x2="72" y2="0" stroke="#ffe9a8" strokeWidth="1.6" />
            <line x1="0" y1="-72" x2="0" y2="-20" stroke="#ffe9a8" strokeWidth="1.6" />
            <circle cx="0" cy="0" r="2.5" fill="#ffe9a8" />
          </svg>
        ) : (
          <svg width="60" height="60" viewBox="-30 -30 60 60">
            <line x1="-16" y1="0" x2="-5" y2="0" stroke="#f4f1e6" strokeWidth="1.6" />
            <line x1="5" y1="0" x2="16" y2="0" stroke="#f4f1e6" strokeWidth="1.6" />
            <line x1="0" y1="-16" x2="0" y2="-5" stroke="#f4f1e6" strokeWidth="1.6" />
            <line x1="0" y1="5" x2="0" y2="16" stroke="#f4f1e6" strokeWidth="1.6" />
            <circle cx="0" cy="0" r="1.2" fill="#f4f1e6" />
          </svg>
        )}

        {hud.hitMarker > 0 && (
          <svg
            width="60"
            height="60"
            viewBox="-30 -30 60 60"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ opacity: Math.min(1, hud.hitMarker * 3) }}
          >
            {[
              [-13, -13, -6, -6],
              [13, -13, 6, -6],
              [-13, 13, -6, 6],
              [13, 13, 6, 6],
            ].map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ff6b52" strokeWidth="2.4" />
            ))}
          </svg>
        )}

      </div>

      {range !== null && (tank || hud.mode === "infantry") && (
        <div className="absolute top-[calc(50%+2.6rem)] whitespace-nowrap text-[11px] tabular-nums text-white/55">
          {Math.round(range)} m
        </div>
      )}

      {hud.hitText && (
        <div className="absolute top-[32%] text-center text-sm font-semibold tracking-[0.18em] text-[#ffd479] drop-shadow">
          {hud.hitText}
        </div>
      )}
    </div>
  );
}

/** Arcs pointing at whatever just hit you. */
function DamageArcs({ dirs }: { dirs: number[] }) {
  if (dirs.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dirs.map((d, i) => (
        <div
          key={i}
          className="absolute h-64 w-64"
          style={{ transform: `rotate(${(d * 180) / Math.PI}deg)` }}
        >
          <div
            className="absolute left-1/2 top-0 h-3 w-28 -translate-x-1/2 rounded-full"
            style={{ background: "linear-gradient(to right, transparent, #d9483a, transparent)", opacity: 0.75 }}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- objectives ---------------- */

function Objectives({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-5">
      <Tickets team="blue" value={hud.tickets.blue} />
      <div className="flex gap-3">
        {hud.zones.map((z) => {
          const pct = ((z.progress + 1) / 2) * 100;
          return (
            <div key={z.id} className="w-28">
              <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em] text-white/60">
                <span
                  className={cn("font-bold", z.contested && "animate-pulse text-[#ffd479]")}
                  style={{ color: z.owner ? TEAM_COLOR[z.owner].hud : undefined }}
                >
                  {z.id}
                </span>
                <span className="truncate pl-1 text-white/40">{z.name}</span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-sm bg-white/15">
                <div className="absolute inset-y-0 left-0 bg-[#e0705a]" style={{ width: `${100 - pct}%` }} />
                <div className="absolute inset-y-0 right-0 bg-[#6ea8dc]" style={{ width: `${pct}%` }} />
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/50" />
              </div>
            </div>
          );
        })}
      </div>
      <Tickets team="red" value={hud.tickets.red} />
    </div>
  );
}

function Tickets({ team, value }: { team: "blue" | "red"; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums leading-none" style={{ color: TEAM_COLOR[team].hud }}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-[0.2em] text-white/35">{team}</div>
    </div>
  );
}

/* ---------------- feed ---------------- */

function Feed({ events }: { events: HudSnapshot["events"] }) {
  return (
    <div className="pointer-events-none absolute right-3 top-12 flex w-72 flex-col items-end gap-1 text-[11px]">
      {events.map((e) => (
        <div
          key={e.id}
          className={cn(
            "rounded-sm bg-black/45 px-2 py-0.5 text-right",
            e.kind === "kill" ? "text-white/85" : "text-[#ffd479]/85",
          )}
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------- status panels ---------------- */

function Status({ hud }: { hud: HudSnapshot }) {
  return (
    <>
      <div className="pointer-events-none absolute bottom-4 left-4 w-56">
        <Bar label="Health" value={hud.hp} max={100} color="#c94f3d" />
        {hud.mode === "infantry" && <Bar label="Stamina" value={hud.stamina} max={100} color="#8aa85a" />}
        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
          {hud.mode === "infantry" ? hud.stance : hud.mode}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 min-w-[15rem] rounded border border-white/10 bg-black/45 p-3">
        {hud.vehicle ? (
          <TankPanel v={hud.vehicle} />
        ) : hud.plane ? (
          <PlanePanel p={hud.plane} />
        ) : (
          <InfantryPanel hud={hud} />
        )}
      </div>
    </>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex justify-between text-[9px] uppercase tracking-[0.18em] text-white/40">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-white/12">
        <div className="h-full transition-[width] duration-150" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function InfantryPanel({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="w-56">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-white/55">{hud.weapon}</span>
        <span className="text-2xl font-semibold tabular-nums">
          {hud.ammo}
          <span className="pl-1 text-sm text-white/40">/ {hud.mags}</span>
        </span>
      </div>
      {hud.reload !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-sm bg-white/15">
          <div className="h-full bg-[#ffd479]" style={{ width: `${hud.reload * 100}%` }} />
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        {hud.loadout.map((w) => (
          <div
            key={w.slot}
            className={cn(
              "flex-1 rounded-sm border px-1.5 py-1 text-center text-[9px] uppercase tracking-wider",
              w.equipped ? "border-[#ffd479]/60 bg-[#ffd479]/10 text-[#ffd479]" : "border-white/10 text-white/40",
            )}
          >
            [{w.slot + 1}] {w.name}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/40">
        <span>{hud.className}</span>
        <span>Grenades {hud.grenades}</span>
      </div>
    </div>
  );
}

function TankPanel({ v }: { v: NonNullable<HudSnapshot["vehicle"]> }) {
  return (
    <div className="w-60">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-white/55">{v.name}</span>
        <span className="text-[10px] tabular-nums text-white/40">{Math.round(v.speed * 3.6)} km/h</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-lg font-semibold" style={{ color: v.shell === "ap" ? "#ffd479" : "#8fd0e0" }}>
          {v.shellName}
        </span>
        <span className="tabular-nums text-white/70">
          AP {v.ap} · HE {v.he}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-white/15">
        <div
          className={cn("h-full", v.reload >= 1 ? "bg-[#8aa85a]" : "bg-[#ffd479]")}
          style={{ width: `${Math.min(1, v.reload) * 100}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {v.modules.map((m) => (
          <div key={m.id} className="text-center">
            <div
              className="mx-auto h-1.5 w-full rounded-sm"
              style={{
                background: m.health > 66 ? "#5f7f4a" : m.health > 25 ? "#c08a3a" : "#a33a2c",
                opacity: m.health > 0 ? 1 : 0.35,
              }}
            />
            <div className="mt-0.5 text-[8px] uppercase tracking-wider text-white/35">{m.label.slice(0, 5)}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
        [1] AP · [2] HE · [RMB] sight · [C] coax
      </div>
    </div>
  );
}

function PlanePanel({ p }: { p: NonNullable<HudSnapshot["plane"]> }) {
  return (
    <div className="w-52">
      <div className="flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/40">
        <span>Speed</span>
        <span>Altitude</span>
      </div>
      <div className="flex justify-between text-lg font-semibold tabular-nums">
        <span className={cn(p.stalling && "animate-pulse text-[#e0705a]")}>{Math.round(p.speed * 3.6)}</span>
        <span>{Math.round(p.alt)} m</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-white/15">
        <div className="h-full bg-[#8aa85a]" style={{ width: `${p.throttle * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/45">
        <span>20 mm {p.ammo}</span>
        <span>Bombs {p.bombs}</span>
      </div>
      {p.stalling && <div className="mt-1 text-center text-[11px] font-semibold text-[#e0705a]">STALL — NOSE DOWN</div>}
    </div>
  );
}

/* ---------------- minimap ---------------- */

function Minimap({ hud }: { hud: HudSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const toPx = (v: number) => ((v + MAP_HALF) / (MAP_HALF * 2)) * size;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(12,16,14,0.72)";
    ctx.fillRect(0, 0, size, size);

    // Capture zones.
    hud.zones.forEach((z, i) => {
      const def = ZONES[i];
      ctx.beginPath();
      ctx.arc(toPx(def.x), toPx(def.z), (def.radius / (MAP_HALF * 2)) * size, 0, Math.PI * 2);
      ctx.fillStyle = z.owner === "blue" ? "rgba(110,168,220,0.2)" : z.owner === "red" ? "rgba(224,112,90,0.2)" : "rgba(255,255,255,0.09)";
      ctx.fill();
      ctx.strokeStyle = z.owner ? TEAM_COLOR[z.owner].hud : "rgba(255,255,255,0.35)";
      ctx.lineWidth = z.contested ? 2 : 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(def.id, toPx(def.x), toPx(def.z) + 3);
    });

    for (const u of hud.minimap as MinimapUnit[]) {
      if (u.self) continue;
      ctx.fillStyle = u.team === "blue" ? BLUE : RED;
      const r = u.kind === "soldier" ? 1.6 : u.kind === "tank" ? 2.6 : 2.2;
      ctx.beginPath();
      if (u.kind === "tank") ctx.rect(toPx(u.x) - r, toPx(u.z) - r, r * 2, r * 2);
      else ctx.arc(toPx(u.x), toPx(u.z), r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The player, with a facing wedge.
    const me = hud.minimap.find((u) => u.self);
    if (me) {
      const x = toPx(me.x);
      const y = toPx(me.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-hud.playerHeading);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
    }
  }, [hud]);

  return (
    <canvas
      ref={ref}
      width={168}
      height={168}
      className="pointer-events-none absolute bottom-24 left-4 rounded border border-white/15"
    />
  );
}

/* ---------------- overlays ---------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[min(46rem,92vw)] rounded-lg border border-white/12 bg-[#12161a]/95 p-8 shadow-2xl">{children}</div>
    </div>
  );
}

type DeployProps = {
  onDeploy: (as: "infantry" | "tank" | "plane") => void;
  selectedClass: ClassId;
  onSelectClass: (id: ClassId) => void;
  selectedPrimary: string;
  onSelectPrimary: (id: string) => void;
};

function Briefing({
  onDeploy,
  onSetup,
  mapName,
  mapBlurb,
  selectedClass,
  onSelectClass,
  selectedPrimary,
  onSelectPrimary,
}: DeployProps & { onSetup: () => void; mapName: string; mapBlurb: string }) {
  return (
    <Shell>
      <div className="text-[10px] uppercase tracking-[0.4em] text-white/35">Combined arms · {mapName}</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">CLAUDEFIELD</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">
        {mapBlurb} Take the capture points and hold them: whoever owns more ground bleeds the other side's
        reinforcements away. Fight it on foot, crew a vehicle, or take one of the aircraft off the strip
        behind your lines.
      </p>
      <ClassPicker
        selected={selectedClass}
        onSelect={onSelectClass}
        selectedPrimary={selectedPrimary}
        onSelectPrimary={onSelectPrimary}
      />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <DeployButton title="Infantry" note="Deploy with the loadout above" onClick={() => onDeploy("infantry")} />
        <DeployButton title="Tank" note="75 mm, AP and HE, real armour" onClick={() => onDeploy("tank")} />
        <DeployButton title="Aircraft" note="20 mm cannon and two bombs" onClick={() => onDeploy("plane")} />
      </div>
      <button
        type="button"
        onClick={onSetup}
        className="mt-3 self-start rounded border border-white/12 px-4 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/50 hover:border-white/35 hover:text-white/80"
      >
        Match setup — map, vehicles and weapons
      </button>
      <ControlsGrid />
    </Shell>
  );
}

function Deploy({
  hud,
  onDeploy,
  selectedClass,
  onSelectClass,
  selectedPrimary,
  onSelectPrimary,
}: DeployProps & { hud: HudSnapshot }) {
  const waiting = hud.respawnIn > 0;
  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">You are down</h2>
        <div className="text-sm tabular-nums text-white/50">
          {waiting ? `Reinforcements in ${hud.respawnIn.toFixed(1)}s` : "Ready"}
        </div>
      </div>
      <ClassPicker
        selected={selectedClass}
        onSelect={onSelectClass}
        selectedPrimary={selectedPrimary}
        onSelectPrimary={onSelectPrimary}
      />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <DeployButton title="Infantry" note="Deploy with the loadout above" disabled={waiting} onClick={() => onDeploy("infantry")} />
        <DeployButton
          title="Tank"
          note={hud.spawnOptions.tanks > 0 ? `${hud.spawnOptions.tanks} in the yard` : "None left in the yard"}
          disabled={waiting || hud.spawnOptions.tanks === 0}
          onClick={() => onDeploy("tank")}
        />
        <DeployButton
          title="Aircraft"
          note={hud.spawnOptions.planes > 0 ? `${hud.spawnOptions.planes} on the strip` : "None on the strip"}
          disabled={waiting || hud.spawnOptions.planes === 0}
          onClick={() => onDeploy("plane")}
        />
      </div>
      <div className="mt-6 flex justify-between text-[11px] uppercase tracking-[0.18em] text-white/40">
        <span>
          Blue {hud.tickets.blue} · Red {hud.tickets.red}
        </span>
        <span>
          {hud.kills} kills · {hud.deaths} deaths
        </span>
      </div>
    </Shell>
  );
}

function ClassPicker({
  selected,
  onSelect,
  selectedPrimary,
  onSelectPrimary,
}: {
  selected: ClassId;
  onSelect: (id: ClassId) => void;
  selectedPrimary: string;
  onSelectPrimary: (id: string) => void;
}) {
  const primaries = primaryOptionsFor(selected);
  return (
    <div className="mt-6">
      <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">Class</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLAYABLE_CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={selected === c.id}
            className={cn(
              "rounded border p-3 text-left transition",
              selected === c.id
                ? "border-[#ffd479]/70 bg-[#ffd479]/10"
                : "border-white/12 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.08]",
            )}
          >
            <div className="text-sm font-semibold">{c.name}</div>
            <div className="mt-1 text-[11px] leading-snug text-white/45">{c.description}</div>
          </button>
        ))}
      </div>
      {primaries.length > 1 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-white/35">Primary weapon</div>
          <div className="flex flex-wrap gap-2">
            {primaries.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelectPrimary(id)}
                aria-pressed={selectedPrimary === id}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  selectedPrimary === id
                    ? "border-[#ffd479]/70 bg-[#ffd479]/10 text-[#ffd479]"
                    : "border-white/15 text-white/60 hover:border-white/35 hover:text-white/85",
                )}
              >
                {WEAPONS[id].name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeployButton({
  title,
  note,
  onClick,
  disabled,
}: {
  title: string;
  note: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded border border-white/12 bg-white/[0.04] p-4 text-left transition",
        disabled ? "cursor-not-allowed opacity-35" : "hover:border-white/35 hover:bg-white/[0.09]",
      )}
    >
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 text-[11px] leading-snug text-white/45">{note}</div>
    </button>
  );
}

function Pause({
  hud,
  onResume,
  onControls,
  onSetup,
}: {
  hud: HudSnapshot;
  onResume: () => void;
  onControls: () => void;
  onSetup: () => void;
}) {
  return (
    <Shell>
      <h2 className="text-2xl font-semibold tracking-tight">Paused</h2>
      <div className="mt-2 text-sm text-white/50">
        Blue {hud.tickets.blue} · Red {hud.tickets.red} — {hud.kills} kills, {hud.deaths} deaths
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onResume}
          className="rounded border border-white/20 bg-white/10 px-5 py-2 text-sm hover:bg-white/20"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onControls}
          className="rounded border border-white/12 px-5 py-2 text-sm text-white/70 hover:bg-white/10"
        >
          Controls
        </button>
        <button
          type="button"
          onClick={onSetup}
          className="rounded border border-white/12 px-5 py-2 text-sm text-white/70 hover:bg-white/10"
        >
          Match setup
        </button>
      </div>
    </Shell>
  );
}

function Result({ hud, onSetup, mapName }: { hud: HudSnapshot; onSetup: () => void; mapName: string }) {
  const won = hud.winner === "blue";
  return (
    <Shell>
      <div className="text-[10px] uppercase tracking-[0.4em] text-white/35">Sector resolved</div>
      <h2 className="mt-2 text-4xl font-semibold tracking-tight" style={{ color: won ? BLUE : RED }}>
        {won ? `Blue holds ${mapName}` : `Red holds ${mapName}`}
      </h2>
      <div className="mt-3 text-sm text-white/55">
        Final reinforcements — Blue {hud.tickets.blue}, Red {hud.tickets.red}. You finished with {hud.kills} kills
        and {hud.deaths} deaths.
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded border border-white/20 bg-white/10 px-5 py-2 text-sm hover:bg-white/20"
        >
          Fight it again
        </button>
        <button
          type="button"
          onClick={onSetup}
          className="rounded border border-white/12 px-5 py-2 text-sm text-white/70 hover:bg-white/10"
        >
          Change map and loadout
        </button>
      </div>
    </Shell>
  );
}

function Controls({ onClose }: { onClose: () => void }) {
  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Controls</h2>
        <button type="button" onClick={onClose} className="text-sm text-white/50 hover:text-white">
          close
        </button>
      </div>
      <ControlsGrid />
    </Shell>
  );
}

function ControlsGrid() {
  // Keyboard bindings first, controller equivalent after the "·".
  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "On foot",
      rows: [
        ["WASD · stick", "Move"],
        ["Shift · L3", "Sprint"],
        ["C / Z · B / Y", "Crouch / prone"],
        ["LMB/RMB · RT/LT", "Fire / aim down sights"],
        ["R · G · X · LB", "Reload · grenade"],
        ["1/2/3 · D-pad", "Switch loadout slot"],
      ],
    },
    {
      title: "In a tank",
      rows: [
        ["W/S · stick", "Throttle / reverse"],
        ["A/D · stick", "Steer"],
        ["Mouse · R-stick", "Traverse turret"],
        ["LMB · C · RT", "Main gun · coaxial"],
        ["RMB · R3", "Gunner's sight"],
        ["1 · 2", "Load AP · HE"],
      ],
    },
    {
      title: "In the air",
      rows: [
        ["Mouse · R-stick", "Pitch and roll"],
        ["A / D", "Rudder"],
        ["W / S", "Throttle"],
        ["LMB · B · RT · ↓", "Cannons · bomb"],
        ["", ""],
        ["", ""],
      ],
    },
    {
      title: "General",
      rows: [
        ["F · RB", "Enter / leave vehicle"],
        ["V · Back", "First / third person"],
        ["M", "Mute"],
        ["Esc · Start", "Pause"],
        ["", ""],
        ["", ""],
      ],
    },
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">{g.title}</div>
          {g.rows.map(([k, v], i) =>
            k ? (
              <div key={i} className="flex justify-between gap-2 py-0.5 text-[11px]">
                <span className="text-white/75">{k}</span>
                <span className="text-right text-white/40">{v}</span>
              </div>
            ) : null,
          )}
        </div>
      ))}
    </div>
  );
}
