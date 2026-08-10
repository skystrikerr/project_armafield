import { useCallback, useEffect, useRef, useState } from "react";
import {
  Apple,
  Crosshair,
  Eye,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Sprout,
  Sun,
  Users,
} from "lucide-react";
import { ThrongletSim, type SimSnapshot, type Tool } from "@/thronglets/scene";
import type { Thronglet } from "@/thronglets/colony";
import { TIER_NAMES } from "@/thronglets/colony";
import { cn } from "@/lib/utils";

const TASK_LABEL: Record<string, string> = {
  idle: "thinking",
  wander: "wandering",
  seekFood: "looking for food",
  eat: "eating",
  seekWater: "looking for water",
  drink: "drinking",
  sleep: "sleeping",
  socialize: "socialising",
  play: "playing",
  gather: "gathering wood",
  build: "building",
  mate: "courting",
};

function NeedBar({
  label,
  value,
  invert = true,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  // Needs are stored as pressure (1 = desperate); show them as satisfaction.
  const pct = Math.round((invert ? 1 - value : value) * 100);
  const tone =
    pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-white/50">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-all duration-300", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/40">
        {pct}
      </span>
    </div>
  );
}

function Trait({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 text-[10px] uppercase tracking-wide text-white/40">
        {label}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-sky-400/80"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-white">
        {value}
      </span>
    </div>
  );
}

export default function Thronglets() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<ThrongletSim | null>(null);

  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [selected, setSelected] = useState<Thronglet | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<Tool>("inspect");
  const [pixelated, setPixelated] = useState(true);
  const [shadows, setShadows] = useState(true);
  const [follow, setFollow] = useState(false);
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const sim = new ThrongletSim(canvasRef.current);
    simRef.current = sim;
    sim.onSnapshot = setSnapshot;
    sim.onSelect = (t) => setSelected(t ? { ...t } : null);
    sim.start();
    if (import.meta.env.DEV) {
      (window as unknown as { __sim?: ThrongletSim }).__sim = sim;
    }

    const ro = new ResizeObserver(() => sim.resize());
    ro.observe(canvasRef.current);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "1") setTool("inspect");
      else if (e.key === "2") setTool("food");
      else if (e.key === "3") setTool("plant");
      else if (e.key === "f") sim.focusSelected();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (simRef.current) simRef.current.paused = paused;
  }, [paused]);
  useEffect(() => {
    if (simRef.current) simRef.current.speed = speed;
  }, [speed]);
  useEffect(() => {
    simRef.current?.setTool(tool);
  }, [tool]);
  useEffect(() => {
    simRef.current?.setPixelated(pixelated);
  }, [pixelated]);
  useEffect(() => {
    simRef.current?.setFollow(follow);
  }, [follow]);
  useEffect(() => {
    simRef.current?.setShadows(shadows);
  }, [shadows]);

  const reseed = useCallback(() => {
    simRef.current?.reseed();
    setSelected(null);
  }, []);

  const tierIdx = Math.max(
    0,
    TIER_NAMES.indexOf(snapshot?.tier ?? TIER_NAMES[0]),
  );
  const nextThreshold = [0, 25, 90, 220, 450, Infinity][tierIdx] ?? Infinity;
  const prevThreshold = [0, 0, 25, 90, 220, 450][tierIdx] ?? 0;
  const tierPct =
    nextThreshold === Infinity
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            (((snapshot?.knowledge ?? 0) - prevThreshold) /
              Math.max(1, nextThreshold - prevThreshold)) *
              100,
          ),
        );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a1030] font-sans">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ imageRendering: pixelated ? "pixelated" : "auto" }}
      />

      {/* Top bar ------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
        <div className="pointer-events-auto max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-black/55 p-2.5 backdrop-blur-sm sm:p-3">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-[#f6cf5a]">
              Thronglets
            </h1>
            <p className="hidden text-[10px] text-white/40 sm:block">
              an autonomous colony · they live, learn and build on their own
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-x-4 gap-y-1.5 sm:grid-cols-6 sm:gap-x-5">
            <Stat label="Alive" value={snapshot?.population ?? 0} />
            <Stat label="Eggs" value={snapshot?.eggs ?? 0} />
            <Stat label="Gen" value={snapshot?.generation ?? 1} />
            <Stat label="Built" value={snapshot?.structures ?? 0} />
            <Stat label="Blocks" value={snapshot?.blocks ?? 0} />
            <Stat
              label="Deaths"
              value={`${snapshot?.deaths ?? 0}/${snapshot?.births ?? 0}`}
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider">
              <span className="text-white/40">
                The Throng · {snapshot?.tier ?? "Scattered"}
              </span>
              <span className="tabular-nums text-emerald-300/80">
                {Math.floor(snapshot?.knowledge ?? 0)} kn
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 sm:w-72">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all"
                style={{ width: `${tierPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/55 p-1.5 backdrop-blur-sm">
            <button
              onClick={() => setPaused((p) => !p)}
              className="rounded-lg p-2 text-white/80 transition hover:bg-white/10"
              aria-label={paused ? "Play" : "Pause"}
            >
              {paused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </button>
            {[1, 2, 4, 8].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s);
                  setPaused(false);
                }}
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-semibold tabular-nums transition",
                  speed === s && !paused
                    ? "bg-[#f6cf5a] text-black"
                    : "text-white/60 hover:bg-white/10",
                )}
              >
                {s}×
              </button>
            ))}
            <div className="mx-1 h-5 w-px bg-white/10" />
            <button
              onClick={reseed}
              className="rounded-lg p-2 text-white/80 transition hover:bg-white/10"
              aria-label="New world"
              title="New world"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/55 p-1.5 backdrop-blur-sm">
            {(
              [
                { id: "inspect", icon: Eye, label: "Inspect / pet" },
                { id: "food", icon: Apple, label: "Drop food" },
                { id: "plant", icon: Sprout, label: "Plant tree" },
              ] as { id: Tool; icon: typeof Eye; label: string }[]
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={label}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition",
                  tool === id
                    ? "bg-[#74bcd8] text-black"
                    : "text-white/60 hover:bg-white/10",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-[11px] text-white/60 backdrop-blur-sm">
            {snapshot?.isNight ? (
              <Moon className="h-3.5 w-3.5 text-sky-300" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-amber-300" />
            )}
            <span className="tabular-nums">
              day {Math.floor((snapshot?.time ?? 0) / 150) + 1}
            </span>
            <div className="h-3 w-px bg-white/10" />
            <button
              onClick={() => setPixelated((p) => !p)}
              className={cn(
                "transition hover:text-white",
                pixelated && "text-[#f6cf5a]",
              )}
            >
              pixel
            </button>
            <button
              onClick={() => setShadows((s) => !s)}
              className={cn(
                "transition hover:text-white",
                shadows && "text-[#f6cf5a]",
              )}
            >
              shadows
            </button>
            <div className="h-3 w-px bg-white/10" />
            <span className="tabular-nums text-white/30">
              {Math.round(snapshot?.fps ?? 0)} fps
            </span>
          </div>
        </div>
      </div>

      {/* Selected thronglet -------------------------------------- */}
      {selected && (
        <div className="pointer-events-auto absolute bottom-3 left-3 w-[280px] rounded-xl border border-white/10 bg-black/65 p-3 backdrop-blur-sm sm:bottom-4 sm:left-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#f6cf5a]">
                {selected.name}
              </h2>
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                gen {selected.gen} · {selected.stage} ·{" "}
                {Math.floor(selected.age)}s old
              </p>
            </div>
            <button
              onClick={() => {
                setFollow((f) => !f);
                simRef.current?.focusSelected();
              }}
              className={cn(
                "rounded-lg p-1.5 transition",
                follow
                  ? "bg-[#5dff7a] text-black"
                  : "text-white/50 hover:bg-white/10",
              )}
              title="Follow"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mt-2 rounded-md bg-white/5 px-2 py-1.5 text-[11px] italic text-white/70">
            “{selected.thought}” —{" "}
            <span className="not-italic text-white/40">
              {TASK_LABEL[selected.task] ?? selected.task}
            </span>
          </p>

          <div className="mt-2.5 space-y-1">
            <NeedBar label="Fed" value={selected.hunger} />
            <NeedBar label="Water" value={selected.thirst} />
            <NeedBar label="Rested" value={selected.energy} />
            <NeedBar label="Social" value={selected.social} />
            <NeedBar label="Joy" value={selected.joy} />
            <NeedBar label="Health" value={selected.health} invert={false} />
          </div>

          <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2">
            <Trait label="Speed" value={selected.genome.speed / 1.6} />
            <Trait label="Curious" value={selected.genome.curiosity} />
            <Trait label="Social" value={selected.genome.sociability} />
            <Trait label="Industry" value={selected.genome.industry} />
          </div>

          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-[10px] text-white/40">
            <span>{selected.blocksPlaced} blocks laid</span>
            <span>{selected.mealsEaten} meals</span>
            <span>{selected.childCount} kin</span>
          </div>
        </div>
      )}

      {/* Event log ------------------------------------------------ */}
      <div className="pointer-events-none absolute bottom-3 right-3 hidden w-[240px] sm:bottom-4 sm:right-4 sm:block">
        <div className="rounded-xl border border-white/10 bg-black/50 p-2.5 backdrop-blur-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
            <Sparkles className="h-3 w-3" />
            colony log
          </div>
          <ul className="space-y-1">
            {(snapshot?.log ?? []).map((e, i) => (
              <li
                key={`${e.t}-${i}`}
                className={cn(
                  "truncate text-[11px]",
                  e.kind === "birth" && "text-emerald-300/80",
                  e.kind === "death" && "text-rose-300/70",
                  e.kind === "built" && "text-sky-300/80",
                  e.kind === "build" && "text-amber-200/70",
                  e.kind === "spawn" && "text-white/60",
                )}
                title={e.text}
              >
                {e.text}
              </li>
            ))}
            {!snapshot?.log.length && (
              <li className="text-[11px] text-white/30">quiet so far…</li>
            )}
          </ul>
        </div>
      </div>

      {/* Help ----------------------------------------------------- */}
      {showHelp && !selected && (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-white/10 bg-black/70 p-3 text-[11px] leading-relaxed text-white/70 backdrop-blur-sm sm:bottom-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-white/80">
              <Users className="h-3.5 w-3.5" /> nobody is driving
            </span>
            <button
              onClick={() => setShowHelp(false)}
              className="text-white/40 transition hover:text-white"
            >
              dismiss
            </button>
          </div>
          Every thronglet scores its own hunger, thirst, tiredness, loneliness
          and the urge to build, then acts on whichever shouts loudest. They
          remember where food and water are, teach each other when they meet,
          pair off, lay eggs and pass on their traits. Drag to orbit, scroll to
          zoom, click one to inspect it (click again to pet). Keys:{" "}
          <span className="text-white/90">space</span> pause,{" "}
          <span className="text-white/90">1/2/3</span> tools,{" "}
          <span className="text-white/90">f</span> focus.
        </div>
      )}
    </div>
  );
}
