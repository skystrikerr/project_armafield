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
  Sprout,
  Sun,
  X,
} from "lucide-react";
import {
  MORPH_NAMES,
  ThrongletSim,
  type SimSnapshot,
  type Tool,
} from "@/thronglets/scene";
import type { ClanReport, Thronglet } from "@/thronglets/colony";
import { ROLE_LABEL, TIER_NAMES } from "@/thronglets/colony";
import { relationLabel } from "@/thronglets/clans";
import { ERAS, TECHS } from "@/thronglets/tech";
import {
  chronicle,
  glossTongue,
  inventFaith,
  listModels,
  loadConfig,
  LlmError,
  PROVIDER_DEFAULTS,
  PROVIDER_ORDER,
  readTheAge,
  saveConfig,
  testConnection,
  voiceOf,
  type LlmConfig,
} from "@/thronglets/llm";
import { cn } from "@/lib/utils";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** How many rungs the ladder has, for the "known 4/17" readout. */
const TECH_COUNT = TECHS.length;

/**
 * The interface is a naturalist's monograph.
 *
 * Every simulation and every AI toy reaches for the same two skins — dark
 * translucent glass, or green-on-black terminal — and both of them say
 * "software" rather than "place". This one is printed paper: an observer's
 * field record of an island, in Garamond, with small-capital headings, ruled
 * data tables, figures set in a tabular monospace, and annotations in red
 * ink. You are not the operator and not a god; you are whoever is keeping
 * the notebook.
 *
 * Which gives the ending its teeth. As the colony works out that it is being
 * watched, the notebook stops being yours: their own invented words start
 * appearing in your margins, in their handwriting, and the paper stains.
 */
const INK = "#211d18";
const RED = "#a3301c";

/** Small-capital heading, the way a printed monograph sets a label. */
const CAPS =
  "font-[500] uppercase tracking-[0.19em] text-[10px] text-[#211d18]/45";

/** Figures: tabular, mono, so columns line up like a printed table. */
const FIG = "font-mono tabular-nums";

/** A sheet of paper on the desk. Square corners, ink rule, a real shadow. */
const PANEL =
  "pointer-events-auto border border-[#211d18]/25 bg-[#efe9db]/95 text-[#211d18] shadow-[0_1px_0_rgba(255,255,255,0.55)_inset,0_14px_34px_-16px_rgba(0,0,0,0.75)] backdrop-blur-[1px]";

/**
 * Laid-paper grain: a fibre texture generated in an inline SVG, so nothing is
 * fetched and the panels do not read as flat CSS rectangles.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.35'/%3E%3C/svg%3E\")";

/** The grain layer, dropped inside a panel. */
function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-[0.13]"
      style={{ backgroundImage: GRAIN }}
    />
  );
}

/** A ruled section heading: small caps with a hairline running off to the right. */
function Rule({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className={cn(CAPS, tone)}>{children}</span>
      <span
        className="h-px flex-1"
        style={{ background: "currentColor", opacity: 0.16 }}
      />
    </div>
  );
}


const TASK_LABEL: Record<string, string> = {
  worship: "at the shrine",
  stock: "filling the store",
  tend: "working the plot",
  trade: "carrying a gift",
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
  const tone = pct > 60 ? "#3f6b4a" : pct > 30 ? "#8a6a1f" : RED;
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[4.5rem] shrink-0 text-[11px] italic text-[#211d18]/55">
        {label}
      </span>
      {/* Ruled like a printed gauge, with ticks rather than a solid track. */}
      <div className="relative h-[7px] flex-1 border-b border-[#211d18]/25">
        <div
          className="absolute bottom-0 left-0 h-[3px] transition-all duration-300"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
      <span
        className={cn(FIG, "w-7 shrink-0 text-right text-[10px] text-[#211d18]/45")}
      >
        {pct}
      </span>
    </div>
  );
}

function Trait({ label, value }: { label: string; value: number }) {
  // Traits are drawn as a row of filled/empty pips — a coded field entry,
  // the way a specimen sheet records a graded observation.
  const pips = Math.round(value * 7);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="w-[4.5rem] shrink-0 text-[11px] italic text-[#211d18]/45">
        {label}
      </span>
      <span className={cn(FIG, "text-[11px] leading-none tracking-[0.18em] text-[#211d18]/70")}>
        {"●".repeat(pips)}
        <span className="text-[#211d18]/20">{"○".repeat(7 - pips)}</span>
      </span>
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
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className={CAPS}>fig. 1 — population</span>
        <span className={cn(FIG, "text-[10px] text-[#211d18]/40")}>
          peak {peak}
        </span>
      </div>
      {/* Plotted onto ruled graph paper, not a glowing sparkline. */}
      <div
        className="border border-[#211d18]/20 sm:w-72"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to right, rgba(33,29,24,0.09) 0 1px, transparent 1px 25%), repeating-linear-gradient(to bottom, rgba(33,29,24,0.09) 0 1px, transparent 1px 25%)",
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="block h-9 w-full"
          aria-hidden
        >
          <polyline
            points={`0,100 ${points} 100,100`}
            fill="rgba(33,29,24,0.10)"
            stroke="none"
          />
          <polyline
            points={points}
            fill="none"
            stroke={INK}
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * The island's history as a stratigraphic column — every first laid down in
 * the order it happened, oldest at the bottom. This is the thing that makes
 * a long run legible: you can read a colony's whole life at a glance and see
 * where the interesting week was.
 */
function Strata({
  log,
  day,
}: {
  log: { t: number; text: string; kind: string }[];
  day: number;
}) {
  const marks = log
    .filter((e) => e.kind === "first" || e.kind === "era")
    .slice(-9)
    .reverse();
  if (!marks.length) return null;
  return (
    <div className="mt-3">
      <Rule>the record</Rule>
      <ol className="space-y-[3px]">
        {marks.map((m, i) => (
          <li key={`${m.t}-${i}`} className="flex gap-2 leading-tight">
            <span
              className={cn(
                FIG,
                "w-9 shrink-0 pt-[3px] text-right text-[9px] text-[#211d18]/35",
              )}
            >
              d{Math.floor(m.t / 150)}
            </span>
            <span
              aria-hidden
              className="mt-[7px] h-px w-2.5 shrink-0"
              style={{ background: m.kind === "era" ? "#8a6a1f" : RED, opacity: 0.7 }}
            />
            <span
              className="text-[12px] leading-snug"
              style={{ color: m.kind === "era" ? "#7a5c18" : RED }}
            >
              {m.text}
            </span>
          </li>
        ))}
      </ol>
      <p className={cn(CAPS, "mt-1.5 opacity-70")}>
        {marks.length} entries · day {day}
      </p>
    </div>
  );
}

/**
 * A people's whole climb, in one block: the age they are in, what they have
 * worked out and who worked it out, and — the interesting part — the two or
 * three things they are currently part way towards.
 */
function TechLadder({ clan }: { clan: ClanReport }) {
  const known = clan.tech.filter((t) => t.known);
  const working = clan.tech
    .filter((t) => t.open && t.progress > 0.01)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
  const next = clan.tech.filter((t) => t.open && t.progress <= 0.01).slice(0, 2);

  return (
    <div className="mt-2 border-t border-[#211d18]/15 pt-1.5">
      <p className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] italic text-[#7a5c18]">
          the age of {clan.eraName.toLowerCase()}
        </span>
        <span className={cn(FIG, "text-[10px] text-[#211d18]/35")}>
          {known.length}/{clan.tech.length}
        </span>
      </p>
      {known.length > 0 && (
        <p className="text-[12px] leading-snug text-[#211d18]/70">
          {known.map((d, i) => (
            <span key={d.id}>
              {i > 0 && <span className="text-[#211d18]/25"> · </span>}
              {d.label}
              {d.by && (
                <span className="text-[10px] text-[#211d18]/35">
                  {" "}
                  ({d.by}, d{d.day})
                </span>
              )}
            </span>
          ))}
        </p>
      )}
      {working.map((t) => (
        <div key={t.id} className="mt-1 flex items-baseline gap-2">
          <span
            className="flex-1 text-[12px] italic text-[#211d18]/55"
            title={t.pressure}
          >
            towards {t.label}
          </span>
          {/* Progress as a ruled scale, ticked in tenths like a printed gauge. */}
          <span className="relative h-[6px] w-16 border-b border-[#211d18]/25">
            <span
              className="absolute bottom-0 left-0 h-[3px] bg-[#8a6a1f] transition-all"
              style={{ width: `${Math.round(t.progress * 100)}%` }}
            />
          </span>
          <span className={cn(FIG, "w-7 text-right text-[10px] text-[#211d18]/35")}>
            {Math.round(t.progress * 100)}
          </span>
        </div>
      ))}
      {next.length > 0 && (
        <p className="mt-1 text-[11px] text-[#211d18]/35">
          within reach: {next.map((t) => t.label).join(", ")}
        </p>
      )}
      {clan.taughtBy && (
        <p className="mt-1 text-[11px] italic" style={{ color: "#2c4a72" }}>
          being shown how by the {clan.taughtBy}
        </p>
      )}
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
    <div className={cn(PANEL, "relative max-w-[calc(100vw-1.5rem)] p-3")}>
      <Grain />
      <button
        onClick={onToggle}
        className={cn(
          CAPS,
          "relative flex w-full items-center justify-between gap-2 transition hover:text-[#211d18]",
        )}
      >
        <span>
          ii. the peoples{" "}
          <span className={FIG}>({peoples.length})</span>
        </span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open && (
        <ul className="relative mt-2 max-h-[42vh] space-y-3 overflow-y-auto pr-1 sm:w-[19rem]">
          {peoples.map((c, idx) => (
            <li
              key={c.id}
              className={cn(idx > 0 && "border-t border-[#211d18]/15 pt-3")}
            >
              <button
                onClick={() => onFocus(c)}
                className="flex w-full items-baseline gap-2 text-left"
              >
                {/* An inked swatch, ruled like a colour plate key. */}
                <span
                  className="h-3 w-3 shrink-0 self-center border border-[#211d18]/50"
                  style={{ background: hex(c.color) }}
                />
                <span className="flex-1 truncate text-[15px] font-[500] leading-tight">
                  {c.name}
                </span>
                <span className={cn(FIG, "text-[11px] text-[#211d18]/45")}>
                  {c.members}
                </span>
              </button>
              {c.towns.length > 0 && (
                <p className="mt-0.5 text-[12px] italic text-[#3f6b4a]">
                  {c.towns.join(", ")}
                </p>
              )}
              <p className="mt-0.5 text-[12px] text-[#211d18]/60">
                worship {c.deity}
                {c.heresy && <span style={{ color: RED }}> · heresy</span>}
                {c.losses > 0 && (
                  <span style={{ color: RED }}> · {c.losses} lost</span>
                )}
              </p>
              <p className="text-[12px] italic leading-snug text-[#211d18]/45">
                “{c.creed}”
              </p>
              <TechLadder clan={c} />
              {Object.keys(c.roles).length > 0 && (
                <p className="mt-1 text-[11px] text-[#211d18]/45">
                  {Object.entries(c.roles)
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, n]) => `${n} ${role}${n > 1 ? "s" : ""}`)
                    .join(" · ")}
                </p>
              )}
              {c.traded > 0 && (
                <p className="text-[11px]" style={{ color: "#2c4a72" }}>
                  {c.traded} carried in from neighbours
                </p>
              )}
              {(c.lessons.thirst > 0 ||
                c.lessons.famine > 0 ||
                c.lessons.raided > 0) && (
                <p className="mt-1 text-[11px] text-[#7a5c18]">
                  learned the hard way:{" "}
                  {[
                    c.lessons.thirst > 0 && `thirst ×${c.lessons.thirst}`,
                    c.lessons.famine > 0 && `famine ×${c.lessons.famine}`,
                    c.lessons.raided > 0 && `raids ×${c.lessons.raided}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {c.tongue.length > 0 && (
                <div className="mt-1.5 border-t border-dotted border-[#211d18]/25 pt-1.5">
                  <p className={cn(CAPS, "mb-1 text-[9px]")}>
                    vocabulary · {c.tongue.length}
                  </p>
                  {/* Set as a glossary: headword, then the gloss in italic. */}
                  <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                    {c.tongue.slice(0, 10).map((w) => (
                      <span key={w.concept} className="text-[12px] leading-snug">
                        <span className="font-[500] text-[#211d18]">{w.word}</span>
                        <span className="italic text-[#211d18]/45"> {w.concept}</span>
                        {w.spread < 0.75 && (
                          <span className={cn(FIG, "text-[9px] text-[#211d18]/30")}>
                            {" "}
                            {Math.round(w.spread * 100)}%
                          </span>
                        )}
                        {w.borrowedFrom && (
                          <span
                            style={{ color: "#2c4a72" }}
                            title={`borrowed from the ${w.borrowedFrom}`}
                          >
                            *
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {c.standings.length > 0 && (
                <p className="mt-1 text-[11px] leading-snug">
                  {c.standings.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && <span className="text-[#211d18]/25"> · </span>}
                      <span className="text-[#211d18]/45">{s.name} </span>
                      <span
                        style={{
                          color:
                            s.value <= -0.55
                              ? RED
                              : s.value <= -0.2
                                ? "#8a6a1f"
                                : s.value >= 0.6
                                  ? "#3f6b4a"
                                  : "rgba(33,29,24,0.4)",
                        }}
                      >
                        {relationLabel(s.value)}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
          {!peoples.length && (
            <li className="text-[12px] italic text-[#211d18]/35">
              nobody has settled yet.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Keep six-figure readouts from blowing the column out. */
function compact(value: string | number) {
  if (typeof value !== "number" || value < 10000) return value;
  return `${(value / 1000).toFixed(value < 100000 ? 1 : 0)}k`;
}

/**
 * One cell of the census table. The figure sits under a hairline rule with
 * the heading in small caps beneath it — the way a column is set in a printed
 * table, rather than a label above a glowing number.
 */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className={cn(FIG, "text-[15px] leading-none text-[#211d18]")}>
        {compact(value)}
      </span>
      <span className="mt-1 border-t border-[#211d18]/20 pt-1 text-[9px] uppercase tracking-[0.16em] text-[#211d18]/40">
        {label}
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
  /** Models the endpoint itself reported, when it will say. */
  const [liveModels, setLiveModels] = useState<string[] | null>(null);
  const [modelsBusy, setModelsBusy] = useState(false);

  /**
   * Town names lettered onto the plate itself. Recomputed on a short timer
   * rather than per frame — the camera moves smoothly enough that ~14 a
   * second is indistinguishable, and it keeps React out of the render loop.
   */
  const [labels, setLabels] = useState<
    ReturnType<ThrongletSim["townLabels"]>
  >([]);
  const [showLabels, setShowLabels] = useState(true);
  useEffect(() => {
    if (!showLabels) {
      setLabels([]);
      return;
    }
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (sim) setLabels(sim.townLabels());
    }, 70);
    return () => window.clearInterval(id);
  }, [showLabels]);

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
      const said = await testConnection(llm);
      return `${PROVIDER_DEFAULTS[llm.provider].label} · ${llm.model} answered: “${said}”\n\nThe connection works. Switch the oracle on above and they will start using it.`;
    });

  /** Some endpoints will list what they can run; the rest we guess at. */
  const fetchModels = useCallback(async () => {
    setModelsBusy(true);
    setLlmError(null);
    try {
      const found = await listModels(llm);
      if (found?.length) setLiveModels(found);
      else {
        setLiveModels(null);
        setLlmError(
          `${PROVIDER_DEFAULTS[llm.provider].label} will not list its models from a browser. Pick one above or type the name.`,
        );
      }
    } finally {
      setModelsBusy(false);
    }
  }, [llm]);

  // A different provider has a different set of models; forget the old list.
  useEffect(() => {
    setLiveModels(null);
  }, [llm.provider, llm.baseUrl]);

  const askAge = () =>
    runOracle("age", async () => {
      const lead = [...(snapshot?.peoples ?? [])].sort((a, b) => b.era - a.era)[0];
      if (!lead) return "There is nobody left to describe.";
      return readTheAge(
        llm,
        lead.name,
        lead.eraName,
        lead.tech.filter((t) => t.known).map((t) => t.label),
        lead.tech
          .filter((t) => t.open && t.progress > 0.05)
          .map((t) => ({ label: t.label, progress: t.progress })),
      );
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

  const askTongue = () =>
    runOracle("tongue", async () => {
      const biggest = snapshot?.peoples[0];
      if (!biggest || !biggest.tongue.length)
        return "They have not named anything yet.";
      return glossTongue(llm, biggest.name, biggest.tongue);
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

  const attention = snapshot?.attention ?? 0;

  /**
   * Marginalia. Once they are aware of being looked at, their words start
   * turning up on the observer's page — real words out of their own lexicon,
   * scrawled in red at the edges, more of them the more they know. Held in a
   * ref-backed list so the same scrawls stay put between frames instead of
   * jittering every time the snapshot lands.
   */
  const marksRef = useRef<
    { key: number; text: string; x: number; y: number; rot: number; size: number }[]
  >([]);
  const wanted = attention < 0.14 ? 0 : Math.min(9, Math.round((attention - 0.1) * 13));
  if (marksRef.current.length !== wanted) {
    const vocab = (snapshot?.peoples ?? []).flatMap((p) => p.tongue.map((w) => w.word));
    if (marksRef.current.length > wanted) {
      marksRef.current = marksRef.current.slice(0, wanted);
    } else if (vocab.length) {
      while (marksRef.current.length < wanted) {
        const i = marksRef.current.length;
        // Deterministic placement from the index, so nothing dances about.
        // Kept to the margins — the outer edge of the page and the gutter
        // between the panels — so they crowd the record without burying it.
        const edge = i % 3;
        marksRef.current.push({
          key: i,
          text: i === 8 ? "??" : vocab[(i * 5 + 3) % vocab.length],
          x: edge === 0 ? 25 + ((i * 7) % 8) : edge === 1 ? 60 + ((i * 11) % 14) : 87 + ((i * 5) % 7),
          y: 8 + ((i * 29) % 82),
          rot: -14 + ((i * 37) % 28),
          size: 13 + ((i * 7) % 12),
        });
      }
    }
  }
  const marginalia = marksRef.current.map((m) => ({
    ...m,
    opacity: Math.min(0.62, 0.18 + attention * 0.5),
  }));

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
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-[#1b1a17]"
      style={{ fontFamily: "'EB Garamond', ui-serif, Georgia, serif" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ imageRendering: pixelated ? "pixelated" : "auto" }}
      />

      {/* The world is a plate in the book: it gets the same faint vignette a
          printed illustration does, and nothing else sits over it. */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(20,17,12,0.42) 100%)",
        }}
      />

      {/* Place names, lettered onto the plate where the towns actually are.
          These are words the clans coined for themselves, so the island stops
          being scenery and becomes a map of somewhere. */}
      <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
        {labels.map((l) => (
          <div
            key={l.key}
            className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-center"
            style={{ left: l.x, top: l.y, opacity: 0.35 + l.near * 0.65 }}
          >
            <div
              className="text-[13px] font-[500] italic leading-none tracking-[0.06em]"
              style={{
                color: "#f6f0e2",
                textShadow:
                  "0 1px 3px rgba(0,0,0,0.85), 0 0 10px rgba(0,0,0,0.55)",
              }}
            >
              {l.name}
            </div>
            {/* A leader line down to the ground, the way a map keys a place. */}
            <div
              className="mx-auto mt-0.5 h-3 w-px"
              style={{ background: hex(l.color), opacity: 0.75 }}
            />
          </div>
        ))}
      </div>

      {/* Their marks. As the colony works out it is being watched, its own
          words start appearing on the observer's page — the notebook stops
          being solely yours. This replaces the usual glitch overlay: it is
          quieter, and it is written in their language rather than ours. */}
      {/* Multiplied into the page rather than laid on top of it, so their
          writing reads as ink soaking through the paper instead of a sticker
          over your notes. */}
      {marginalia.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden mix-blend-multiply">
          {marginalia.map((m) => (
            <span
              key={m.key}
              className="absolute select-none whitespace-nowrap italic"
              style={{
                left: `${m.x}%`,
                top: `${m.y}%`,
                color: RED,
                opacity: m.opacity,
                fontSize: `${m.size}px`,
                transform: `rotate(${m.rot}deg)`,
                textShadow: "0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              {m.text}
            </span>
          ))}
        </div>
      )}

      {/* Top bar ------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
       {/* The left-hand page: masthead, then the peoples, then whichever
           specimen is under observation — one continuous column that scrolls,
           rather than three panels fighting for the same corner. */}
       <div className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem)] flex-col gap-2 overflow-y-auto pb-1 pr-1 sm:max-h-[calc(100dvh-2rem)]">
        <div className={cn(PANEL, "relative max-w-[calc(100vw-1.5rem)] p-3 sm:p-4")}>
          <Grain />
          <div className="relative flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {/* A masthead: title, then the running head a journal carries
                  across the top of every recto page. */}
              <h1 className="text-[19px] font-[500] leading-none tracking-[0.03em] text-[#211d18]">
                Observations upon the Thronglets
              </h1>
              <div className="mt-1 border-y border-[#211d18]/25 py-[3px]">
                <p className={cn(CAPS, "flex flex-wrap gap-x-2 text-[9px]")}>
                  <span>
                    an island · year {snapshot?.year ?? 1} · day{" "}
                    {Math.floor((snapshot?.time ?? 0) / 150)}
                  </span>
                  <span className="text-[#211d18]/25">|</span>
                  <span>{snapshot?.season ?? "green season"}</span>
                  <span className="text-[#211d18]/25">|</span>
                  <span>{snapshot?.sky ?? "clear"}</span>
                  <span className="text-[#211d18]/25">|</span>
                  <span>no keeper present</span>
                </p>
              </div>
            </div>
          </div>

          {/* Twelve figures, four to a row: the table closes flush at three
              rows and sits the same width as everything under it, so the
              column reads as one page rather than three stacked cards. The
              year and the day live in the running head above instead. */}
          <div className="relative mt-3 grid grid-cols-4 gap-x-4 gap-y-2.5 sm:w-[19rem]">
            <Stat label="Alive" value={snapshot?.population ?? 0} />
            <Stat label="Eggs" value={snapshot?.eggs ?? 0} />
            <Stat label="Gen" value={snapshot?.generation ?? 1} />
            <Stat
              label="Deaths"
              value={`${snapshot?.deaths ?? 0}/${snapshot?.births ?? 0}`}
            />
            <Stat label="Built" value={snapshot?.structures ?? 0} />
            <Stat label="Blocks" value={snapshot?.blocks ?? 0} />
            <Stat label="Towns" value={snapshot?.towns ?? 0} />
            <Stat label="Stone" value={snapshot?.stoneLeft ?? 0} />
            <Stat label="Peoples" value={snapshot?.clans ?? 0} />
            <Stat label="Gods" value={snapshot?.faiths ?? 0} />
            <Stat label="Words" value={snapshot?.words ?? 0} />
            <Stat
              label="Known"
              value={`${snapshot?.discoveries ?? 0}/${TECH_COUNT}`}
            />
          </div>
          {(snapshot?.wars ?? 0) > 0 && (
            <p className="relative mt-2 text-[12px] italic" style={{ color: RED }}>
              {snapshot?.wars} feud{snapshot?.wars === 1 ? "" : "s"} open
              {snapshot?.killed ? `, ${snapshot.killed} killed in them` : ""}.
            </p>
          )}

          {/* The ages, drawn as a stratigraphic column laid on its side:
              finished ages hatched solid, the current one part-filled, the
              ones still to come left as empty ground. */}
          <div className="relative mt-3.5">
            <Rule tone="text-[#7a5c18]">i. the ages</Rule>
            <div className="flex sm:w-[19rem]">
              {ERAS.map((e, i) => {
                const era = snapshot?.era ?? 0;
                const done = era > i;
                const here = era === i;
                return (
                  <div key={e.name} className="flex-1" title={`${e.name} — ${e.blurb}`}>
                    <div
                      className="relative h-[13px] border-y border-r border-[#211d18]/30 first:border-l"
                      style={
                        done
                          ? {
                              backgroundImage:
                                "repeating-linear-gradient(45deg, #8a6a1f 0 1px, transparent 1px 4px)",
                            }
                          : undefined
                      }
                    >
                      {here && (
                        <div
                          className="absolute inset-y-0 left-0 bg-[#8a6a1f]/45 transition-all"
                          style={{
                            width: `${Math.round((snapshot?.eraProgress ?? 0) * 100)}%`,
                          }}
                        />
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-center text-[8px] uppercase tracking-[0.08em]",
                        here
                          ? "text-[#7a5c18]"
                          : done
                            ? "text-[#211d18]/40"
                            : "text-[#211d18]/20",
                      )}
                    >
                      {e.name}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[12px] italic leading-snug text-[#211d18]/55">
              {snapshot && snapshot.era >= ERAS.length - 1
                ? "there is nothing above this one."
                : `${ERAS[snapshot?.era ?? 0].blurb} — ${Math.round(
                    (snapshot?.eraProgress ?? 0) * 100,
                  )}% of the way to ${ERAS[Math.min((snapshot?.era ?? 0) + 1, ERAS.length - 1)].name.toLowerCase()}.`}
            </p>
          </div>

          <div className="relative mt-3">
            <div className="flex items-baseline justify-between">
              <span className={CAPS}>
                the throng · {snapshot?.tier ?? "Scattered"}
              </span>
              <span className={cn(FIG, "text-[10px] text-[#211d18]/40")}>
                {Math.floor(snapshot?.knowledge ?? 0)}
              </span>
            </div>
            <div className="mt-1 h-[6px] border-b border-[#211d18]/25 sm:w-[19rem]">
              <div
                className="h-[3px] bg-[#211d18]/55 transition-all"
                style={{ width: `${tierPct}%` }}
              />
            </div>
          </div>

          <div className="relative">
            <PopulationChart history={snapshot?.history ?? []} />
          </div>

          <div className="relative">
            <Strata
              log={snapshot?.log ?? []}
              day={Math.floor((snapshot?.time ?? 0) / 150)}
            />
          </div>

          {attention > 0.05 && (
            <div
              className="relative mt-3 border-t pt-2"
              style={{ borderColor: "rgba(163,48,28,0.35)" }}
            >
              {/* Struck through the observer's own record, in red, the way a
                  later hand annotates a page it disagrees with. */}
              <div className="flex items-baseline justify-between">
                <span
                  className="text-[13px] italic"
                  style={{ color: RED }}
                >
                  they are aware of being observed
                </span>
                <span className={cn(FIG, "text-[10px]")} style={{ color: RED }}>
                  {Math.round(attention * 100)}%
                  {(snapshot?.watching ?? 0) > 0 &&
                    ` · ${snapshot?.watching} looking up`}
                </span>
              </div>
              <div
                className="mt-1 h-[6px] border-b sm:w-[19rem]"
                style={{ borderColor: "rgba(163,48,28,0.35)" }}
              >
                <div
                  className="h-[3px] transition-all"
                  style={{
                    width: `${Math.round(attention * 100)}%`,
                    background: RED,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <PeoplesPanel
          peoples={snapshot?.peoples ?? []}
          open={peoplesOpen}
          onToggle={() => setPeoplesOpen((o) => !o)}
          onFocus={focusClan}
        />
        {/* Selected thronglet -------------------------------------- */}
        {selected && (
          <div
            className={cn(
              PANEL,
              "relative w-full p-3.5 sm:w-[19rem]",
            )}
          >
            <Grain />
            {/* A specimen sheet: plate number in the corner, name set as a
                headword, everything else as ruled entries beneath it. */}
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn(CAPS, "text-[9px]")}>
                  specimen no. {selected.id}
                </p>
                <h2 className="text-[20px] font-[500] leading-tight text-[#211d18]">
                  {selected.name}
                </h2>
                <p className="text-[12px] italic leading-snug text-[#211d18]/55">
                  {selected.stage}, generation {selected.gen},{" "}
                  {ROLE_LABEL[selected.role] ?? selected.role} of the{" "}
                  {selected.family} line
                </p>
                <p className="text-[12px] leading-snug text-[#211d18]/45">
                  {MORPH_NAMES[Math.floor(selected.genome.morph)] ?? "amber"} form ·{" "}
                  {selected.parentNames
                    ? `out of ${selected.parentNames[0]} and ${selected.parentNames[1]}`
                    : "of the first landing"}
                </p>
                {selectedClan && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                    <span
                      className="h-2.5 w-2.5 border border-[#211d18]/50"
                      style={{ background: hex(selectedClan.color) }}
                    />
                    <span className="text-[#211d18]/70">{selectedClan.name}</span>
                    <span className="text-[#211d18]/25">·</span>
                    <span className="italic text-[#5b3a86]">
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
                  "shrink-0 p-1.5 transition",
                  follow
                    ? "bg-[#211d18] text-[#efe9db]"
                    : "text-[#211d18]/40 hover:text-[#211d18]",
                )}
                title="Keep in view"
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* The quotation is the centrepiece — set as a pull quote, indented
                with a rule, the way a monograph carries a recorded utterance. */}
            <blockquote
              className="relative mt-2.5 border-l-2 border-[#211d18]/30 pl-2.5"
              style={{ color: INK }}
            >
              <p className="text-[15px] italic leading-snug">
                “{selected.thought}”
              </p>
              <p className={cn(CAPS, "mt-0.5 text-[9px]")}>
                observed: {TASK_LABEL[selected.task] ?? selected.task}
              </p>
            </blockquote>

            <div className="relative mt-3">
              <Rule>condition</Rule>
              <div className="space-y-[3px]">
                <NeedBar label="fed" value={selected.hunger} />
                <NeedBar label="watered" value={selected.thirst} />
                <NeedBar label="rested" value={selected.energy} />
                <NeedBar label="company" value={selected.social} />
                <NeedBar label="content" value={selected.joy} />
                <NeedBar label="devotion" value={selected.spirit} />
                <NeedBar label="whole" value={selected.health} invert={false} />
              </div>
            </div>

            <div className="relative mt-3">
              <Rule>inherited</Rule>
              <div className="space-y-[3px]">
                <Trait label="quick" value={selected.genome.speed / 1.6} />
                <Trait label="curious" value={selected.genome.curiosity} />
                <Trait label="sociable" value={selected.genome.sociability} />
                <Trait label="industrious" value={selected.genome.industry} />
                <Trait label="devout" value={selected.genome.devotion} />
                <Trait label="tempered" value={selected.genome.aggression} />
              </div>
            </div>

            {(selected.carryingWood > 0 ||
              selected.carryingStone > 0 ||
              selected.carryingFood > 0) && (
              <p className="relative mt-2 text-[12px] italic text-[#7a5c18]">
                carrying{" "}
                {[
                  selected.carryingWood > 0 && `${selected.carryingWood} wood`,
                  selected.carryingStone > 0 && `${selected.carryingStone} stone`,
                  selected.carryingFood > 0 && `${selected.carryingFood} food`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}

            <div
              className={cn(
                FIG,
                "relative mt-2.5 flex justify-between border-t border-[#211d18]/20 pt-1.5 text-[10px] text-[#211d18]/45",
              )}
            >
              <span>{selected.blocksPlaced} laid</span>
              <span>{selected.childCount} kin</span>
              <span style={selected.kills > 0 ? { color: RED } : undefined}>
                {selected.kills} killed
              </span>
            </div>

            {selected.episodes.length > 0 && (
              <div className="relative mt-2.5">
                <Rule>what has happened to it</Rule>
                {/* Hanging indent, like a numbered list of field notes. */}
                <ol className="space-y-0.5">
                  {selected.episodes
                    .slice(-4)
                    .reverse()
                    .map((m, i) => (
                      <li
                        key={i}
                        className="flex gap-1.5 text-[12px] leading-snug text-[#211d18]/55"
                      >
                        <span className={cn(FIG, "text-[9px] text-[#211d18]/30")}>
                          {selected.episodes.length - i}.
                        </span>
                        <span>{m}</span>
                      </li>
                    ))}
                </ol>
              </div>
            )}

            {llm.enabled && (
              <button
                onClick={askVoice}
                disabled={llmBusy !== null}
                className="relative mt-2.5 flex w-full items-center justify-center gap-1.5 border border-[#5b3a86]/35 px-2 py-1.5 text-[12px] italic text-[#5b3a86] transition hover:bg-[#5b3a86]/10 disabled:opacity-40"
              >
                {llmBusy === "voice" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Brain className="h-3 w-3" />
                )}
                take down what it is thinking
              </button>
            )}
          </div>
        )}
       </div>

        {/* Controls */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className={cn(PANEL, "relative flex items-center gap-0.5 p-1.5")}>
            <Grain />
            <button
              onClick={() => setPaused((p) => !p)}
              className="relative p-1.5 text-[#211d18]/70 transition hover:text-[#211d18]"
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
                  FIG,
                  "relative px-1.5 py-1 text-[11px] transition",
                  speed === s && !paused
                    ? "bg-[#211d18] text-[#efe9db]"
                    : "text-[#211d18]/50 hover:text-[#211d18]",
                )}
              >
                {s}×
              </button>
            ))}
            <span className="relative mx-1 h-4 w-px bg-[#211d18]/20" />
            <button
              onClick={reseed}
              className="relative p-1.5 text-[#211d18]/70 transition hover:text-[#211d18]"
              aria-label="New world"
              title="A different island"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOracleOpen(true)}
              className={cn(
                "relative p-1.5 transition hover:text-[#211d18]",
                llm.enabled ? "text-[#5b3a86]" : "text-[#211d18]/45",
              )}
              aria-label="Oracle"
              title="Connect a language model"
            >
              <Brain className="h-4 w-4" />
            </button>
          </div>

          <div className={cn(PANEL, "relative flex items-center gap-0.5 p-1.5")}>
            <Grain />
            {(
              [
                { id: "inspect", icon: Eye, label: "observe" },
                { id: "food", icon: Apple, label: "set down food" },
                { id: "plant", icon: Sprout, label: "plant" },
              ] as { id: Tool; icon: typeof Eye; label: string }[]
            ).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={label}
                className={cn(
                  "relative flex items-center gap-1.5 px-2 py-1.5 text-[12px] italic transition",
                  tool === id
                    ? "bg-[#211d18] not-italic text-[#efe9db]"
                    : "text-[#211d18]/55 hover:text-[#211d18]",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div
            className={cn(
              PANEL,
              "relative flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#211d18]/55",
            )}
          >
            <Grain />
            {snapshot?.isNight ? (
              <Moon className="relative h-3.5 w-3.5 text-[#2c4a72]" />
            ) : (
              <Sun className="relative h-3.5 w-3.5 text-[#8a6a1f]" />
            )}
            <span className={cn(FIG, "relative text-[11px]")}>
              day {Math.floor((snapshot?.time ?? 0) / 150) + 1}
            </span>
            <span className="relative h-3 w-px bg-[#211d18]/20" />
            <span className="relative italic">
              {snapshot?.sky ?? "clear"}, {snapshot?.season ?? "green season"}
            </span>
            <span className="relative h-3 w-px bg-[#211d18]/20" />
            <button
              onClick={() => setPixelated((p) => !p)}
              className={cn(
                "relative transition hover:text-[#211d18]",
                pixelated ? "text-[#211d18]" : "text-[#211d18]/35 line-through",
              )}
            >
              plate
            </button>
            <button
              onClick={() => setShadows((s) => !s)}
              className={cn(
                "relative transition hover:text-[#211d18]",
                shadows ? "text-[#211d18]" : "text-[#211d18]/35 line-through",
              )}
            >
              shadow
            </button>
            <button
              onClick={() => setShowLabels((l) => !l)}
              className={cn(
                "relative transition hover:text-[#211d18]",
                showLabels ? "text-[#211d18]" : "text-[#211d18]/35 line-through",
              )}
            >
              names
            </button>
            <span className="relative h-3 w-px bg-[#211d18]/20" />
            <span className={cn(FIG, "relative text-[10px] text-[#211d18]/30")}>
              {Math.round(snapshot?.fps ?? 0)} fps
            </span>
          </div>
        </div>
      </div>


      {/* The journal ---------------------------------------------- */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-20 hidden w-[268px] sm:bottom-4 sm:right-4 sm:block">
        <div className={cn(PANEL, "relative p-3")}>
          <Grain />
          <div className="relative">
            <Rule>iii. the journal</Rule>
          </div>
          {/* A ruled margin down the left, entries hanging off it with the
              day in the gutter — an actual observation journal. */}
          <ul className="relative space-y-[5px] border-l border-[#a3301c]/25 pl-2">
            {(snapshot?.log ?? []).map((e, i) => {
              const tone =
                e.kind === "first" || e.kind === "watched"
                  ? RED
                  : e.kind === "era" || e.kind === "discovery"
                    ? "#7a5c18"
                    : e.kind === "death" || e.kind === "kill" || e.kind === "war"
                      ? "rgba(163,48,28,0.75)"
                      : e.kind === "faith" || e.kind === "convert" || e.kind === "schism"
                        ? "#5b3a86"
                        : e.kind === "trade" || e.kind === "weather"
                          ? "#2c4a72"
                          : e.kind === "birth" || e.kind === "built" || e.kind === "grow"
                            ? "#3f6b4a"
                            : "rgba(33,29,24,0.62)";
              const loud = e.kind === "first" || e.kind === "era" || e.kind === "watched";
              return (
                <li
                  key={`${e.t}-${i}`}
                  className="flex gap-1.5 leading-snug"
                  title={e.text}
                >
                  <span
                    className={cn(
                      FIG,
                      "w-[1.6rem] shrink-0 pt-[2px] text-right text-[9px] text-[#211d18]/25",
                    )}
                  >
                    {Math.floor(e.t / 150)}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-[12.5px]",
                      loud ? "font-[500] italic" : "",
                    )}
                    style={{ color: tone }}
                  >
                    {e.text}
                  </span>
                </li>
              );
            })}
            {!snapshot?.log.length && (
              <li className="text-[12px] italic text-[#211d18]/30">
                nothing recorded yet.
              </li>
            )}
          </ul>
        </div>
      </div>


      {/* Oracle -------------------------------------------------- */}
      {oracleOpen && (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-[#1b1a17]/70 p-4 backdrop-blur-[2px]">
          <div
            className={cn(
              PANEL,
              "relative max-h-[88dvh] w-full max-w-lg overflow-y-auto p-5",
            )}
          >
            <Grain />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className={cn(CAPS, "text-[9px]")}>appendix</p>
                <h2 className="text-[21px] font-[500] leading-tight text-[#211d18]">
                  On consulting an oracle
                </h2>
                <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#211d18]/60">
                  The colony needs nothing from you: left alone it names its own
                  gods, words its own creeds and invents its own vocabulary. But
                  a language model may be given the pen instead — to name their
                  gods, to speak for whichever creature you have under
                  observation, and to write up the record as history. Everything
                  below is kept in this browser and sent nowhere but the
                  endpoint you name.
                </p>
              </div>
              <button
                onClick={() => setOracleOpen(false)}
                className="shrink-0 p-1.5 text-[#211d18]/40 transition hover:text-[#211d18]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setLlm({ ...llm, enabled: false })}
                className={cn(
                  "border px-3 py-2 text-left text-[12px] transition",
                  !llm.enabled
                    ? "border-[#211d18] bg-[#211d18] text-[#efe9db]"
                    : "border-[#211d18]/25 text-[#211d18]/60 hover:border-[#211d18]/60",
                )}
              >
                <span className="block font-[500]">unassisted</span>
                <span className="block text-[11px] italic opacity-70">
                  they invent everything themselves
                </span>
              </button>
              <button
                onClick={() => setLlm({ ...llm, enabled: true })}
                className={cn(
                  "border px-3 py-2 text-left text-[12px] transition",
                  llm.enabled
                    ? "border-[#5b3a86] bg-[#5b3a86] text-[#efe9db]"
                    : "border-[#211d18]/25 text-[#211d18]/60 hover:border-[#5b3a86]/60",
                )}
              >
                <span className="block font-[500]">with an oracle</span>
                <span className="block text-[11px] italic opacity-70">
                  a model writes their scripture
                </span>
              </button>
            </div>

            <div className="relative mt-4 grid gap-2">
              <Rule>whose model</Rule>
              <div className="grid grid-cols-3 gap-1.5">
                {PROVIDER_ORDER.map((p) => (
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
                      "border px-2 py-1.5 text-[12px] transition",
                      llm.provider === p
                        ? "border-[#5b3a86] bg-[#5b3a86] text-[#efe9db]"
                        : "border-[#211d18]/25 text-[#211d18]/60 hover:border-[#211d18]/60",
                    )}
                  >
                    {PROVIDER_DEFAULTS[p].label}
                  </button>
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-[#211d18]/50">
                {PROVIDER_DEFAULTS[llm.provider].hint}
                {PROVIDER_DEFAULTS[llm.provider].keyUrl && (
                  <>
                    {" "}
                    <a
                      href={PROVIDER_DEFAULTS[llm.provider].keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="italic underline decoration-dotted underline-offset-2 hover:text-[#211d18]"
                    >
                      get a key
                    </a>
                    .
                  </>
                )}
              </p>

              <div className="mt-1 flex items-center gap-2">
                <span className={CAPS}>which model</span>
                <span className="h-px flex-1 bg-[#211d18]/15" />
                <button
                  onClick={fetchModels}
                  disabled={modelsBusy}
                  className="flex items-center gap-1 text-[11px] italic text-[#211d18]/45 transition hover:text-[#211d18] disabled:opacity-40"
                >
                  {modelsBusy && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  ask the endpoint
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(liveModels ?? PROVIDER_DEFAULTS[llm.provider].models.map((m) => m.id)).map(
                  (id) => {
                    const note = PROVIDER_DEFAULTS[llm.provider].models.find(
                      (m) => m.id === id,
                    )?.note;
                    return (
                      <button
                        key={id}
                        onClick={() => setLlm({ ...llm, model: id })}
                        title={note || undefined}
                        className={cn(
                          FIG,
                          "border px-2 py-1 text-[11px] transition",
                          llm.model === id
                            ? "border-[#5b3a86] bg-[#5b3a86]/12 text-[#5b3a86]"
                            : "border-[#211d18]/20 text-[#211d18]/55 hover:border-[#211d18]/50",
                        )}
                      >
                        {id}
                        {note && (
                          <span
                            className="ml-1 text-[#211d18]/35"
                            style={{ fontFamily: "'EB Garamond', serif", fontStyle: "italic" }}
                          >
                            {note}
                          </span>
                        )}
                      </button>
                    );
                  },
                )}
              </div>

              <input
                value={llm.model}
                onChange={(e) => setLlm({ ...llm, model: e.target.value })}
                placeholder="…or write any model name"
                spellCheck={false}
                className={cn(
                  FIG,
                  "border-0 border-b border-[#211d18]/30 bg-transparent px-0.5 py-1 text-[12px] text-[#211d18] outline-none placeholder:italic placeholder:text-[#211d18]/25 focus:border-[#5b3a86]",
                )}
                style={{ fontFamily: undefined }}
              />
              <input
                value={llm.baseUrl}
                onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })}
                placeholder="endpoint"
                spellCheck={false}
                className={cn(
                  FIG,
                  "border-0 border-b border-[#211d18]/20 bg-transparent px-0.5 py-1 text-[12px] text-[#211d18]/65 outline-none focus:border-[#5b3a86]",
                )}
              />
              {PROVIDER_DEFAULTS[llm.provider].needsKey && (
                <input
                  value={llm.apiKey}
                  onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
                  placeholder="api key — kept in this browser, sent only to the endpoint above"
                  type="password"
                  spellCheck={false}
                  className={cn(
                    FIG,
                    "border-0 border-b border-[#211d18]/30 bg-transparent px-0.5 py-1 text-[12px] text-[#211d18] outline-none placeholder:italic placeholder:text-[#211d18]/25 focus:border-[#5b3a86]",
                  )}
                />
              )}
            </div>

            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {[
                { id: "test", label: "test the connection", run: testModel, need: false },
                { id: "gods", label: "name the gods", run: nameTheGods, need: true },
                { id: "voice", label: "give one a voice", run: askVoice, need: true },
                { id: "age", label: "read the age", run: askAge, need: true },
                { id: "tongue", label: "read their tongue", run: askTongue, need: true },
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
                  className="flex items-center gap-1.5 border border-[#211d18]/25 px-2.5 py-1.5 text-[12px] italic text-[#211d18]/70 transition hover:border-[#211d18]/60 hover:text-[#211d18] disabled:opacity-25"
                >
                  {llmBusy === a.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  {a.label}
                </button>
              ))}
            </div>

            {llmError && (
              <p
                className="relative mt-3 border-l-2 py-1 pl-2.5 text-[12.5px] italic leading-relaxed"
                style={{ borderColor: RED, color: RED }}
              >
                {llmError}
              </p>
            )}
            {oracleText && (
              <div className="relative mt-4 border-t border-[#211d18]/20 pt-3">
                <p className={cn(CAPS, "mb-1 text-[9px]")}>as taken down</p>
                <pre
                  className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#211d18]/85"
                  style={{ fontFamily: "'EB Garamond', ui-serif, Georgia, serif" }}
                >
                  {oracleText}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Colophon — how to read the book ------------------------- */}
      {showHelp && !selected && (
        <div
          className={cn(
            PANEL,
            "absolute bottom-3 left-1/2 z-20 w-[min(92vw,440px)] -translate-x-1/2 p-3.5 sm:bottom-4",
          )}
        >
          <Grain />
          <div className="relative mb-1.5 flex items-baseline justify-between">
            <span className={CAPS}>a note on method</span>
            <button
              onClick={() => setShowHelp(false)}
              className="text-[11px] italic text-[#211d18]/40 transition hover:text-[#211d18]"
            >
              close the note
            </button>
          </div>
          <p className="relative text-[13px] leading-relaxed text-[#211d18]/70">
            Nothing here is directed. Each thronglet weighs its own hunger,
            thirst, tiredness, loneliness and devotion against the urge to
            build, and does whichever shouts loudest. They name things, carry
            words between villages, pair off, lay eggs, split into peoples and
            fall out over whose god is real — and, given long enough, work out
            fire, then stone, then writing.{" "}
            <em className="text-[#211d18]">
              They may also work out that they are being read about.
            </em>
          </p>
          <p className="relative mt-2 text-[12px] leading-relaxed text-[#211d18]/50">
            Press and hold on one to lift it, and set it down anywhere. Drag the
            ground to turn the plate, scroll to close in, click a creature to
            take its particulars (again to pet it).{" "}
            <span className={cn(FIG, "text-[11px] text-[#211d18]/70")}>space</span>{" "}
            to hold,{" "}
            <span className={cn(FIG, "text-[11px] text-[#211d18]/70")}>1 2 3</span>{" "}
            for the instruments,{" "}
            <span className={cn(FIG, "text-[11px] text-[#211d18]/70")}>f</span> to
            keep one in view.
          </p>
        </div>
      )}
    </div>
  );
}
