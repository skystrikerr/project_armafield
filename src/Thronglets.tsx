import { useCallback, useEffect, useRef, useState } from "react";
import {
  Apple,
  Brain,
  ChevronDown,
  Crosshair,
  Eye,
  Loader2,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  Users,
  X,
} from "lucide-react";
import { ThrongletSim, type SimSnapshot, type Tool } from "@/thronglets/scene";
import type { ClanReport, Thronglet } from "@/thronglets/colony";
import { TIER_NAMES } from "@/thronglets/colony";
import { relationLabel } from "@/thronglets/clans";
import {
  chronicle,
  inventFaith,
  loadConfig,
  LlmError,
  PROVIDER_DEFAULTS,
  saveConfig,
  voiceOf,
  type LlmConfig,
  type LlmProvider,
} from "@/thronglets/llm";
import { cn } from "@/lib/utils";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const TASK_LABEL: Record<string, string> = {
  worship: "at the shrine",
  raid: "raiding",
  flee: "fleeing",
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

/** Population over the colony's life, drawn straight to an SVG path. */
function PopulationChart({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const peak = Math.max(4, ...history);
  const step = 100 / (history.length - 1);
  const points = history
    .map((n, i) => `${(i * step).toFixed(2)},${(100 - (n / peak) * 100).toFixed(2)}`)
    .join(" ");
  return (
    <div className="mt-2.5">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
        <span>population</span>
        <span className="tabular-nums">peak {peak}</span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-8 w-full sm:w-72"
        aria-hidden
      >
        <polyline
          points={`0,100 ${points} 100,100`}
          fill="rgba(246,207,90,0.16)"
          stroke="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#f6cf5a"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** The peoples of the island: who they are, what they worship, who they hate. */
function PeoplesPanel({
  peoples,
  open,
  onToggle,
  onFocus,
}: {
  peoples: ClanReport[];
  open: boolean;
  onToggle: () => void;
  onFocus: (c: ClanReport) => void;
}) {
  return (
    <div className="pointer-events-auto max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-black/55 p-2.5 backdrop-blur-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-white/50 transition hover:text-white"
      >
        <span className="flex items-center gap-1.5">
          <Users className="h-3 w-3" /> peoples · {peoples.length}
        </span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <ul className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto pr-1 sm:w-72">
          {peoples.map((c) => (
            <li key={c.id} className="rounded-lg bg-white/5 p-2">
              <button
                onClick={() => onFocus(c)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: hex(c.color) }}
                />
                <span className="flex-1 truncate text-xs font-semibold text-white">
                  {c.name}
                </span>
                <span className="text-[10px] tabular-nums text-white/40">
                  {c.members}
                </span>
              </button>
              <p className="mt-1 text-[10px] text-white/50">
                worship {c.deity}
                {c.heresy && (
                  <span className="text-rose-300/70"> · heresy</span>
                )}
                {c.losses > 0 && (
                  <span className="text-rose-300/70"> · {c.losses} lost</span>
                )}
              </p>
              <p className="text-[10px] italic text-white/35">“{c.creed}”</p>
              {c.standings.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.standings.map((s) => (
                    <span
                      key={s.id}
                      className={cn(
                        "rounded px-1 py-0.5 text-[9px]",
                        s.value <= -0.55
                          ? "bg-rose-500/25 text-rose-200"
                          : s.value <= -0.2
                            ? "bg-amber-500/20 text-amber-200"
                            : s.value >= 0.6
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "bg-white/10 text-white/50",
                      )}
                    >
                      {s.name}: {relationLabel(s.value)}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {!peoples.length && (
            <li className="text-[11px] text-white/30">nobody yet…</li>
          )}
        </ul>
      )}
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
  const [peoplesOpen, setPeoplesOpen] = useState(true);

  // The optional model connection. Config lives in localStorage only.
  const [oracleOpen, setOracleOpen] = useState(false);
  const [llm, setLlm] = useState<LlmConfig>(() => loadConfig());
  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [oracleText, setOracleText] = useState("");

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

  useEffect(() => {
    saveConfig(llm);
  }, [llm]);

  const reseed = useCallback(() => {
    simRef.current?.reseed();
    setSelected(null);
  }, []);

  const focusClan = useCallback((c: ClanReport) => {
    simRef.current?.lookAt(c.home.x, c.home.z);
  }, []);

  /** Every model call goes through here so failures land in one place. */
  const runOracle = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      setLlmBusy(label);
      setLlmError(null);
      try {
        setOracleText(await fn());
      } catch (err) {
        setLlmError(
          err instanceof LlmError ? err.message : String((err as Error)?.message ?? err),
        );
      } finally {
        setLlmBusy(null);
      }
    },
    [],
  );

  const testModel = () =>
    runOracle("test", async () => {
      const { complete } = await import("@/thronglets/llm");
      return complete(llm, "Reply with exactly: the throng is listening.", {
        maxTokens: 32,
      });
    });

  const nameTheGods = () =>
    runOracle("gods", async () => {
      const sim = simRef.current;
      if (!sim) return "";
      const lines: string[] = [];
      for (const clan of sim.colony.clans.filter((c) => c.members > 0)) {
        const parent = clan.faith.heresyOf
          ? sim.colony.faiths.find((f) => f.id === clan.faith.heresyOf)?.deity
          : null;
        const out = await inventFaith(llm, {
          clan: clan.name,
          sacred: clan.faith.sacred,
          heresyOf: parent,
        });
        if (!out) continue;
        clan.faith.deity = out.deity;
        clan.faith.creed = out.creed;
        sim.colony.addLog(
          `The ${clan.name} learn the true name of their god: ${out.deity}.`,
          "faith",
        );
        lines.push(`The ${clan.name} — ${out.deity}\n“${out.creed}”`);
      }
      return lines.join("\n\n") || "The model had nothing to say.";
    });

  const askVoice = () =>
    runOracle("voice", async () => {
      const sim = simRef.current;
      if (!sim || !selected) return "";
      const clan = sim.colony.clanOf(selected);
      const mine = snapshot?.peoples.find((p) => p.id === clan?.id);
      return voiceOf(llm, {
        name: selected.name,
        clan: clan?.name ?? "lost",
        deity: clan?.faith.deity ?? "nothing",
        creed: clan?.faith.creed ?? "",
        stage: selected.stage,
        age: selected.age,
        parents: selected.parentNames
          ? `${selected.parentNames[0]} and ${selected.parentNames[1]}`
          : null,
        task: TASK_LABEL[selected.task] ?? selected.task,
        hunger: selected.hunger,
        thirst: selected.thirst,
        energy: selected.energy,
        spirit: selected.spirit,
        kills: selected.kills,
        blocksPlaced: selected.blocksPlaced,
        children: selected.childCount,
        atWarWith:
          mine?.standings.filter((s) => s.value <= -0.55).map((s) => s.name) ?? [],
      });
    });

  const askChronicle = () =>
    runOracle("chronicle", async () =>
      chronicle(
        llm,
        [...(snapshot?.log ?? [])].reverse().map((e) => e.text),
        (snapshot?.peoples ?? []).map((p) => ({
          name: p.name,
          deity: p.deity,
          members: p.members,
        })),
      ),
    );

  const selectedClan = selected
    ? snapshot?.peoples.find((p) =>
        simRef.current
          ? simRef.current.colony.clanOf(selected)?.id === p.id
          : false,
      )
    : undefined;

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
       <div className="flex flex-col gap-2">
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
            <Stat label="Clans" value={snapshot?.clans ?? 0} />
            <Stat label="Gods" value={snapshot?.faiths ?? 0} />
            <Stat
              label="Wars"
              value={`${snapshot?.wars ?? 0}${snapshot?.killed ? ` · ${snapshot.killed}†` : ""}`}
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

          <PopulationChart history={snapshot?.history ?? []} />
        </div>

        <PeoplesPanel
          peoples={snapshot?.peoples ?? []}
          open={peoplesOpen}
          onToggle={() => setPeoplesOpen((o) => !o)}
          onFocus={focusClan}
        />
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
            <button
              onClick={() => setOracleOpen(true)}
              className={cn(
                "rounded-lg p-2 transition hover:bg-white/10",
                llm.enabled ? "text-[#c9a6ff]" : "text-white/50",
              )}
              aria-label="Oracle"
              title="Connect a language model"
            >
              <Brain className="h-4 w-4" />
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
              <p className="mt-0.5 text-[10px] text-white/35">
                of the {selected.family} line ·{" "}
                {selected.parentNames
                  ? `child of ${selected.parentNames[0]} & ${selected.parentNames[1]}`
                  : "one of the first"}
              </p>
              {selectedClan && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: hex(selectedClan.color) }}
                  />
                  <span className="text-white/60">{selectedClan.name}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-[#c9a6ff]/80">
                    {selectedClan.deity}
                  </span>
                </p>
              )}
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
            <NeedBar label="Faith" value={selected.spirit} />
            <NeedBar label="Health" value={selected.health} invert={false} />
          </div>

          <div className="mt-2.5 space-y-1 border-t border-white/10 pt-2">
            <Trait label="Speed" value={selected.genome.speed / 1.6} />
            <Trait label="Curious" value={selected.genome.curiosity} />
            <Trait label="Social" value={selected.genome.sociability} />
            <Trait label="Industry" value={selected.genome.industry} />
            <Trait label="Devotion" value={selected.genome.devotion} />
            <Trait label="Temper" value={selected.genome.aggression} />
          </div>

          <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-[10px] text-white/40">
            <span>{selected.blocksPlaced} blocks</span>
            <span>{selected.childCount} kin</span>
            <span className={cn(selected.kills > 0 && "text-rose-300/70")}>
              {selected.kills} killed
            </span>
          </div>

          {llm.enabled && (
            <button
              onClick={askVoice}
              disabled={llmBusy !== null}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#c9a6ff]/15 px-2 py-1.5 text-[11px] text-[#c9a6ff] transition hover:bg-[#c9a6ff]/25 disabled:opacity-40"
            >
              {llmBusy === "voice" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Brain className="h-3 w-3" />
              )}
              ask what it is thinking
            </button>
          )}
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
                  "line-clamp-2 text-[11px] leading-snug",
                  e.kind === "birth" && "text-emerald-300/80",
                  e.kind === "death" && "text-rose-300/70",
                  e.kind === "built" && "text-sky-300/80",
                  e.kind === "build" && "text-amber-200/70",
                  e.kind === "spawn" && "text-white/60",
                  e.kind === "war" && "text-rose-400/80",
                  e.kind === "kill" && "text-rose-400",
                  e.kind === "peace" && "text-emerald-300/70",
                  e.kind === "faith" && "text-[#c9a6ff]/90",
                  e.kind === "schism" && "text-amber-300/90",
                  e.kind === "convert" && "text-[#c9a6ff]/70",
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


      {/* Oracle -------------------------------------------------- */}
      {oracleOpen && (
        <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1226] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-[#c9a6ff]">
                  <Brain className="h-4 w-4" /> the oracle
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                  Point the colony at a language model and it starts writing its
                  own religion: naming gods, wording creeds, speaking for a
                  creature you have selected, and turning the log into a
                  chronicle. Everything below stays in this browser, and the sim
                  runs perfectly well with it switched off.
                </p>
              </div>
              <button
                onClick={() => setOracleOpen(false)}
                className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={llm.enabled}
                onChange={(e) => setLlm({ ...llm, enabled: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#c9a6ff]"
              />
              use a model
            </label>

            <div className="mt-3 grid gap-2">
              <div className="flex gap-1.5">
                {(Object.keys(PROVIDER_DEFAULTS) as LlmProvider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() =>
                      setLlm({
                        ...llm,
                        provider: p,
                        baseUrl: PROVIDER_DEFAULTS[p].baseUrl,
                        model: PROVIDER_DEFAULTS[p].model,
                      })
                    }
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-[11px] transition",
                      llm.provider === p
                        ? "bg-[#c9a6ff] text-black"
                        : "bg-white/5 text-white/60 hover:bg-white/10",
                    )}
                  >
                    {PROVIDER_DEFAULTS[p].label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-white/35">
                {PROVIDER_DEFAULTS[llm.provider].hint}
              </p>

              <input
                value={llm.baseUrl}
                onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })}
                placeholder="http://localhost:11434"
                spellCheck={false}
                className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a6ff]/60"
              />
              <input
                value={llm.model}
                onChange={(e) => setLlm({ ...llm, model: e.target.value })}
                placeholder="model name"
                spellCheck={false}
                className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a6ff]/60"
              />
              {PROVIDER_DEFAULTS[llm.provider].needsKey && (
                <input
                  value={llm.apiKey}
                  onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                  placeholder="api key — kept in this browser only"
                  type="password"
                  spellCheck={false}
                  className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#c9a6ff]/60"
                />
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { id: "test", label: "test", run: testModel, need: false },
                { id: "gods", label: "name the gods", run: nameTheGods, need: true },
                { id: "voice", label: "voice", run: askVoice, need: true },
                {
                  id: "chronicle",
                  label: "write the chronicle",
                  run: askChronicle,
                  need: true,
                },
              ].map((a) => (
                <button
                  key={a.id}
                  onClick={a.run}
                  disabled={
                    llmBusy !== null ||
                    (a.need && !llm.enabled) ||
                    (a.id === "voice" && !selected)
                  }
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-white/75 transition hover:bg-white/10 disabled:opacity-30"
                >
                  {llmBusy === a.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  {a.label}
                </button>
              ))}
            </div>

            {llmError && (
              <p className="mt-3 rounded-lg bg-rose-500/15 px-2.5 py-2 text-[11px] leading-relaxed text-rose-200">
                {llmError}
              </p>
            )}
            {oracleText && (
              <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-white/5 px-3 py-2.5 font-sans text-[12px] leading-relaxed text-white/80">
                {oracleText}
              </pre>
            )}
          </div>
        </div>
      )}

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
