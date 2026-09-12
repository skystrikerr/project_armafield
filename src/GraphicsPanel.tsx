import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  PRESETS,
  loadSettings,
  presetOf,
  saveSettings,
  settingsForPreset,
  type GraphicsSettings,
  type PresetId,
  type ShadowQuality,
} from "@/ironfront/graphics";

/**
 * The graphics panel, shown from the pause menu and from the match setup
 * screen. Every change applies immediately and is saved, so the player can
 * judge a setting against the battle it is running over rather than against a
 * description of it.
 */
export default function GraphicsPanel({
  onApply,
  onClose,
}: {
  onApply: (s: GraphicsSettings) => void;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<GraphicsSettings>(() => loadSettings());

  function change(next: GraphicsSettings) {
    // The preset row reports what the values actually are, so nudging a slider
    // off "High" says so instead of leaving High highlighted over settings
    // that are no longer High.
    const tagged = { ...next, preset: presetOf(next) };
    setSettings(tagged);
    saveSettings(tagged);
    onApply(tagged);
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-h-[92vh] w-[min(46rem,92vw)] overflow-y-auto rounded-lg border border-white/12 bg-[#12161a]/95 p-8 shadow-2xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Graphics</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/12 px-4 py-1.5 text-sm text-white/70 hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <SectionLabel>Preset</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={settings.preset === p.id}
              title={p.blurb}
              onClick={() => change(settingsForPreset(p.id as Exclude<PresetId, "custom">, settings.showFps))}
              className={cn(
                "rounded border px-3 py-2.5 text-left text-sm transition",
                settings.preset === p.id
                  ? "border-[#6ea8dc] bg-white/[0.08]"
                  : "border-white/12 bg-white/[0.02] hover:bg-white/[0.06]",
              )}
            >
              <div className="font-semibold">{p.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-white/40">{p.blurb}</div>
            </button>
          ))}
        </div>
        {settings.preset === "custom" && (
          <div className="mt-2 text-[11px] text-white/40">Custom — adjusted from a preset.</div>
        )}

        <SectionLabel>Shadows</SectionLabel>
        <div className="grid grid-cols-4 gap-2">
          {(["off", "low", "medium", "high"] as ShadowQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={settings.shadows === q}
              onClick={() => change({ ...settings, shadows: q })}
              className={cn(
                "rounded border px-3 py-2 text-sm capitalize transition",
                settings.shadows === q
                  ? "border-[#6ea8dc] bg-white/[0.08]"
                  : "border-white/12 bg-white/[0.02] hover:bg-white/[0.06]",
              )}
            >
              {q}
            </button>
          ))}
        </div>
        <Hint>Usually the single biggest cost. Turn it off first if the frame rate is poor.</Hint>

        <Slider
          label="Resolution"
          value={settings.renderScale}
          min={0.5}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(renderScale) => change({ ...settings, renderScale })}
          hint="Renders below native and scales up. The cheapest way to buy frames."
        />
        <Slider
          label="View distance"
          value={settings.viewDistance}
          min={0.5}
          max={1.6}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(viewDistance) => change({ ...settings, viewDistance })}
          hint="How far the haze lets you see. Lower pulls the horizon in and draws less of the map."
        />
        <Slider
          label="Foliage"
          value={settings.foliage}
          min={0.3}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(foliage) => change({ ...settings, foliage })}
          hint="Thins bushes and undergrowth. Trees are held back from the full range — they are cover, not just scenery."
        />
        <Slider
          label="Exposure"
          value={settings.exposure}
          min={0.6}
          max={1.6}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(exposure) => change({ ...settings, exposure })}
          hint="Brightness of the filmic curve. Only applies with cinematic tone mapping on."
        />

        <SectionLabel>Options</SectionLabel>
        <Toggle
          label="Cinematic tone mapping"
          hint="A filmic curve instead of raw output. Holds highlights on snow and sunlit armour instead of blowing them out."
          on={settings.cinematic}
          onChange={(cinematic) => change({ ...settings, cinematic })}
        />
        <Toggle
          label="Antialiasing"
          hint="Smooths the hard edges low-poly geometry is full of. Fixed when the match starts — takes effect on the next one."
          on={settings.antialias}
          onChange={(antialias) => change({ ...settings, antialias })}
        />
        <Toggle
          label="Show frame rate"
          hint="The counter in the top-right corner."
          on={settings.showFps}
          onChange={(showFps) => change({ ...settings, showFps })}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-6 text-[11px] uppercase tracking-[0.18em] text-white/35">{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="mt-1.5 text-[11px] leading-snug text-white/35">{children}</div>;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-sm tabular-nums text-white/55">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[#6ea8dc]"
      />
      <Hint>{hint}</Hint>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "mt-2 flex w-full items-center gap-3 rounded border px-3 py-2.5 text-left transition",
        on ? "border-[#6ea8dc] bg-white/[0.07]" : "border-white/12 bg-white/[0.02] hover:bg-white/[0.06]",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-sm border",
          on ? "border-[#6ea8dc] bg-[#6ea8dc]" : "border-white/25",
        )}
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-[11px] leading-snug text-white/35">{hint}</span>
      </span>
    </button>
  );
}
