import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABEL,
  ERA_LABEL,
  MAPS,
  NATIONS_OF_ERA,
  NATION_LABEL,
  MatchConfig,
  PLAYABLE_ERAS,
  PRESETS,
  WEAPON_GROUP_LABEL,
  mapById,
  vehiclesInCategory,
  weaponGroups,
  type EraId,
  type MatchSettings,
  type TeamLoadout,
  type VehicleCategory,
  type WeaponGroup,
} from "@/ironfront/matchConfig";
import { WEAPONS } from "@/ironfront/units";
import { cn } from "@/lib/utils";

/**
 * Pre-match setup overlay. Binds directly to a MatchConfig instance and hands
 * the compiled settings object to `onStart` when the player commits.
 *
 * Everything here is a view over MatchConfig — this component never holds
 * loadout state of its own, so the object handed to the spawner is always
 * exactly what the screen showed.
 */

const CATEGORIES: VehicleCategory[] = ["light", "transport", "armor", "artillery", "air"];
const GROUPS: WeaponGroup[] = ["rifles", "smgs", "machine_guns", "anti_tank", "sidearms"];

export default function MatchSetup({ onStart }: { onStart: (s: MatchSettings) => void }) {
  // One config instance for the lifetime of the screen.
  const configRef = useRef<MatchConfig | null>(null);
  if (configRef.current === null) configRef.current = new MatchConfig("all_out");
  const config = configRef.current;

  const [settings, setSettings] = useState<MatchSettings>(() => config.getMatchSettings());
  const [activeTab, setActiveTab] = useState<"team1" | "team2">("team1");
  // Which preset the *current map* is showing. Held by MatchConfig rather than
  // here, because it changes when you switch maps.
  const activePreset = config.activePreset();

  useEffect(() => {
    const unsubscribe = config.subscribe(setSettings);
    return () => {
      unsubscribe();
    };
  }, [config]);

  const problems = useMemo(() => config.validate(), [config, settings]);
  const activeMap = mapById(settings.mapId);
  const canStart = problems.length === 0;

  const start = useCallback(() => {
    if (!canStart) return;
    onStart(config.getMatchSettings());
  }, [canStart, config, onStart]);

  const team = settings.teams[activeTab];

  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[#0b0e12]/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full w-[min(78rem,94vw)] flex-col gap-5 px-4 py-8">
        {/* ---- header ---- */}
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/35">Match setup</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">CLAUDEFIELD</h1>
          </div>
          <div className="text-right text-[11px] text-white/40">
            <div>
              Seed <span className="tabular-nums text-white/70">{settings.seed}</span>
            </div>
            <button
              type="button"
              onClick={() => config.randomizeSeed()}
              className="mt-1 rounded border border-white/15 px-2 py-1 text-[10px] uppercase tracking-[0.16em] hover:border-white/40 hover:text-white/80"
            >
              Reroll terrain
            </button>
          </div>
        </header>

        {/* ---- era ---- */}
        <section>
          <SectionLabel>Era</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {PLAYABLE_ERAS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => config.setEra(e)}
                aria-pressed={settings.eraId === e}
                className={cn(
                  "rounded border px-5 py-2.5 text-sm font-semibold transition",
                  settings.eraId === e
                    ? "border-[#ffd479]/70 bg-[#ffd479]/10 text-[#ffd479]"
                    : "border-white/12 bg-white/[0.03] text-white/60 hover:border-white/30 hover:bg-white/[0.07]",
                )}
              >
                {ERA_LABEL[e]}
              </button>
            ))}
            <span className="self-center pl-2 text-[11px] leading-snug text-white/35">
              Each era keeps its own roster for every map — switching back finds it as you left it.
            </span>
          </div>
        </section>

        {/* ---- map ---- */}
        <section>
          <SectionLabel>Map</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MAPS.map((m) => {
              const summary = config.summaryFor(m.id);
              const selected = settings.mapId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => config.setMap(m.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded border p-3 text-left transition",
                    selected
                      ? "border-[#6ea8dc]/70 bg-[#6ea8dc]/10"
                      : "border-white/12 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]",
                  )}
                >
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="mt-1 text-[11px] leading-snug text-white/45">{m.blurb}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.tags.map((t) => (
                      <span key={t} className="rounded-full border border-white/12 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/40">
                        {t}
                      </span>
                    ))}
                  </div>
                  {/* Each map remembers its own roster — show it without opening it. */}
                  <div className="mt-2 text-[10px] tabular-nums text-white/35">
                    {summary.vehicles} vehicles · {summary.weapons} weapons · {summary.bots} bots
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- everything below this line belongs to the selected map ---- */}
        <div className="flex items-center gap-3 rounded border border-[#6ea8dc]/25 bg-[#6ea8dc]/[0.06] px-4 py-2.5">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Configuring</span>
          <span className="text-sm font-semibold text-[#6ea8dc]">
            {ERA_LABEL[settings.eraId]} · {activeMap.name}
          </span>
          <span className="text-[11px] text-white/35">
            {activePreset ? PRESETS.find((p) => p.id === activePreset)?.name : "Custom roster"}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => config.copyToAllMaps()}
              className="rounded border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55 hover:border-white/40 hover:text-white/85"
            >
              Copy to all maps
            </button>
            <button
              type="button"
              onClick={() => config.resetMap()}
              className="rounded border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/55 hover:border-white/40 hover:text-white/85"
            >
              Reset map
            </button>
          </div>
        </div>

        {/* ---- presets ---- */}
        <section>
          <SectionLabel>Preset</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => config.applyPreset(p.id)}
                aria-pressed={activePreset === p.id}
                className={cn(
                  "rounded border p-3 text-left transition",
                  activePreset === p.id
                    ? "border-[#ffd479]/70 bg-[#ffd479]/10"
                    : "border-white/12 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]",
                )}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-1 text-[11px] leading-snug text-white/45">{p.blurb}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ---- team tabs ---- */}
        <section className="flex-1">
          <div className="mb-3 flex gap-2">
            {(["team1", "team2"] as const).map((slot) => {
              const t = settings.teams[slot];
              const accent = t.team === "blue" ? "#6ea8dc" : "#e0705a";
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setActiveTab(slot)}
                  aria-pressed={activeTab === slot}
                  className={cn(
                    "flex-1 rounded border px-4 py-2.5 text-left transition",
                    activeTab === slot ? "bg-white/[0.07]" : "bg-white/[0.02] hover:bg-white/[0.05]",
                  )}
                  style={{ borderColor: activeTab === slot ? accent : "rgba(255,255,255,0.12)" }}
                >
                  <span className="text-sm font-semibold" style={{ color: accent }}>
                    {NATION_LABEL[t.nation]}
                  </span>
                  <span className="ml-2 text-[11px] text-white/40">
                    {t.botCount} bots · {t.tickets} tickets · {t.enabledVehicles.length} vehicles
                  </span>
                </button>
              );
            })}
          </div>

          <NationPicker config={config} slot={activeTab} team={team} settings={settings} />
          <TeamPanel config={config} slot={activeTab} team={team} era={settings.eraId} />
        </section>

        {/* ---- start ---- */}
        <footer className="sticky bottom-0 -mx-4 border-t border-white/10 bg-[#0b0e12]/95 px-4 py-4 backdrop-blur">
          {problems.length > 0 && (
            <ul className="mb-3 space-y-1">
              {problems.map((p) => (
                <li key={p} className="text-[11px] text-[#e0705a]">
                  — {p}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className={cn(
              "w-full rounded border px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] transition",
              canStart
                ? "border-[#ffd479]/70 bg-[#ffd479]/15 text-[#ffd479] hover:bg-[#ffd479]/25"
                : "cursor-not-allowed border-white/10 text-white/25",
            )}
          >
            Start Match
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------- team panel ---------------- */

function TeamPanel({
  config,
  slot,
  team,
  era,
}: {
  config: MatchConfig;
  slot: "team1" | "team2";
  team: TeamLoadout;
  era: EraId;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---- weapons ---- */}
      <div className="rounded border border-white/10 bg-white/[0.02] p-4">
        <SectionLabel>Weapons</SectionLabel>
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const ids = weaponGroups(team.nation)[group];
            const allOn = ids.every((id) => team.enabledWeapons.includes(id));
            return (
              <div key={group}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {WEAPON_GROUP_LABEL[group]}
                  </span>
                  <button
                    type="button"
                    onClick={() => config.setWeaponGroup(slot, group, !allOn)}
                    className="text-[10px] uppercase tracking-wider text-white/35 hover:text-white/70"
                  >
                    {allOn ? "None" : "All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ids.map((id) => (
                    <Chip
                      key={id}
                      label={WEAPONS[id]?.name ?? id}
                      active={team.enabledWeapons.includes(id)}
                      onClick={() => config.toggleWeapon(slot, id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- vehicles ---- */}
      <div className="rounded border border-white/10 bg-white/[0.02] p-4">
        <SectionLabel>Vehicles</SectionLabel>
        <div className="space-y-3">
          {CATEGORIES.map((category) => {
            const defs = vehiclesInCategory(team.nation, category, era);
            if (defs.length === 0) return null;
            const allOn = defs.every((v) => team.enabledVehicles.includes(v.id));
            return (
              <div key={category}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                    {CATEGORY_LABEL[category]}
                  </span>
                  <button
                    type="button"
                    onClick={() => config.setVehicleCategory(slot, category, !allOn)}
                    className="text-[10px] uppercase tracking-wider text-white/35 hover:text-white/70"
                  >
                    {allOn ? "None" : "All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {defs.map((v) => (
                    <Chip
                      key={v.id}
                      label={v.displayName}
                      title={v.blurb}
                      active={team.enabledVehicles.includes(v.id)}
                      onClick={() => config.toggleVehicle(slot, v.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- numbers ---- */}
      <div className="rounded border border-white/10 bg-white/[0.02] p-4 lg:col-span-2">
        <SectionLabel>Force</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider
            label="Bots"
            value={team.botCount}
            min={0}
            max={40}
            step={1}
            onChange={(v) => config.setBotCount(slot, v)}
          />
          <Slider
            label="Tickets"
            value={team.tickets}
            min={50}
            max={1000}
            step={10}
            onChange={(v) => config.setTickets(slot, v)}
          />
          <Slider
            label="AI Skill"
            value={Math.round(team.skill * 100)}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => config.setSkill(slot, v / 100)}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------- primitives ---------------- */

/**
 * Which combatant this team fields. The other team's nation is disabled rather
 * than hidden, so it is obvious why it cannot be picked.
 */
function NationPicker({
  config,
  slot,
  team,
  settings,
}: {
  config: MatchConfig;
  slot: "team1" | "team2";
  team: TeamLoadout;
  settings: MatchSettings;
}) {
  const taken = slot === "team1" ? settings.teams.team2.nation : settings.teams.team1.nation;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <SectionLabel>Nation</SectionLabel>
      {NATIONS_OF_ERA[settings.eraId].map((n) => {
        const active = team.nation === n;
        const disabled = !active && n === taken;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => config.setNation(slot, n)}
            aria-pressed={active}
            title={disabled ? "Already fielded by the other team" : NATION_LABEL[n]}
            className={cn(
              "rounded border px-3 py-1.5 text-xs font-semibold transition",
              active
                ? "border-[#ffd479]/70 bg-[#ffd479]/10 text-[#ffd479]"
                : disabled
                  ? "cursor-not-allowed border-white/8 text-white/20"
                  : "border-white/12 bg-white/[0.03] text-white/60 hover:border-white/30 hover:bg-white/[0.07]",
            )}
          >
            {NATION_LABEL[n]}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/35">{children}</div>;
}

function Chip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] transition",
        active
          ? "border-[#ffd479]/60 bg-[#ffd479]/10 text-[#ffd479]"
          : "border-white/12 text-white/45 hover:border-white/35 hover:text-white/75",
      )}
    >
      {label}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.16em] text-white/45">
        <span>{label}</span>
        <span className="tabular-nums text-white/75">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#ffd479]"
      />
    </label>
  );
}
