import * as THREE from "three";

/**
 * Graphics settings.
 *
 * Everything here is a knob the player can turn, plus the code that applies it
 * to a live renderer. The game runs on anything from a laptop's integrated
 * chip to a desktop card, and the two want very different things: shadows and
 * a full-resolution buffer are most of the frame cost, and view distance is
 * most of the rest.
 *
 * Settings live in localStorage rather than in the match config, because they
 * describe the machine rather than the battle — changing map or nation should
 * not reset them, and they should survive a reload.
 */

export type ShadowQuality = "off" | "low" | "medium" | "high";

export type GraphicsSettings = {
  /** Named preset the sliders came from, or "custom" once they are touched. */
  preset: PresetId;
  shadows: ShadowQuality;
  /** Fraction of the native resolution to render at, 0.5 to 1. */
  renderScale: number;
  /** Multiplier on the biome's fog distances, 0.5 (close haze) to 1.6 (clear). */
  viewDistance: number;
  /** Vegetation and clutter kept, 0.3 to 1. */
  foliage: number;
  antialias: boolean;
  /** Filmic tone mapping and a warmer key light, against flat unmapped output. */
  cinematic: boolean;
  exposure: number;
  showFps: boolean;
};

export type PresetId = "low" | "balanced" | "high" | "ultra" | "custom";

export const PRESETS: { id: PresetId; name: string; blurb: string }[] = [
  { id: "low", name: "Low", blurb: "Integrated graphics. No shadows, half resolution, close horizon." },
  { id: "balanced", name: "Balanced", blurb: "The default. Shadows on, full resolution, most of the view." },
  { id: "high", name: "High", blurb: "Sharper shadows and a clear horizon. Wants a real GPU." },
  { id: "ultra", name: "Ultra", blurb: "Everything on, nothing culled. For screenshots." },
];

const PRESET_VALUES: Record<Exclude<PresetId, "custom">, Omit<GraphicsSettings, "preset" | "showFps">> = {
  low: { shadows: "off", renderScale: 0.6, viewDistance: 0.6, foliage: 0.35, antialias: false, cinematic: false, exposure: 1 },
  balanced: { shadows: "low", renderScale: 1, viewDistance: 1, foliage: 0.75, antialias: true, cinematic: true, exposure: 1 },
  high: { shadows: "medium", renderScale: 1, viewDistance: 1.25, foliage: 1, antialias: true, cinematic: true, exposure: 1 },
  ultra: { shadows: "high", renderScale: 1, viewDistance: 1.6, foliage: 1, antialias: true, cinematic: true, exposure: 1.05 },
};

export const DEFAULT_SETTINGS: GraphicsSettings = {
  preset: "balanced",
  ...PRESET_VALUES.balanced,
  showFps: true,
};

/** The shadow map edge length each quality level asks the GPU for. */
const SHADOW_SIZE: Record<ShadowQuality, number> = { off: 0, low: 1024, medium: 2048, high: 4096 };

/** How far from the camera shadows are still drawn, per quality level. */
const SHADOW_RANGE: Record<ShadowQuality, number> = { off: 0, low: 90, medium: 130, high: 190 };

export function settingsForPreset(preset: Exclude<PresetId, "custom">, showFps: boolean): GraphicsSettings {
  return { preset, ...PRESET_VALUES[preset], showFps };
}

const STORAGE_KEY = "claudefield.graphics.v1";

export function loadSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as Partial<GraphicsSettings>;
    // Merged over the defaults rather than trusted wholesale: a save written by
    // an older build is missing whatever has been added since, and a hand-edited
    // one can hold anything at all.
    return sanitise({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GraphicsSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private browsing, or storage full. Not worth failing a match over.
  }
}

function sanitise(s: GraphicsSettings): GraphicsSettings {
  const clamp = (v: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return {
    preset: (["low", "balanced", "high", "ultra", "custom"] as PresetId[]).includes(s.preset) ? s.preset : "balanced",
    shadows: (["off", "low", "medium", "high"] as ShadowQuality[]).includes(s.shadows) ? s.shadows : "low",
    renderScale: clamp(s.renderScale, 0.5, 1, 1),
    viewDistance: clamp(s.viewDistance, 0.5, 1.6, 1),
    foliage: clamp(s.foliage, 0.3, 1, 0.75),
    antialias: s.antialias !== false,
    cinematic: s.cinematic !== false,
    exposure: clamp(s.exposure, 0.6, 1.6, 1),
    showFps: s.showFps !== false,
  };
}

/**
 * Which named preset a set of values corresponds to, or "custom". Called after
 * every slider move so the preset row highlights itself honestly instead of
 * claiming "High" over settings that are no longer High.
 */
export function presetOf(s: GraphicsSettings): PresetId {
  for (const [id, v] of Object.entries(PRESET_VALUES) as [Exclude<PresetId, "custom">, typeof PRESET_VALUES.low][]) {
    if (
      v.shadows === s.shadows &&
      v.renderScale === s.renderScale &&
      v.viewDistance === s.viewDistance &&
      v.foliage === s.foliage &&
      v.antialias === s.antialias &&
      v.cinematic === s.cinematic &&
      v.exposure === s.exposure
    ) {
      return id;
    }
  }
  return "custom";
}

/**
 * Push settings into a live renderer and scene.
 *
 * Everything except antialiasing can change without rebuilding anything —
 * antialiasing is fixed when the WebGL context is created, so the flag is read
 * at construction and a change only takes effect on the next match. The panel
 * says so rather than pretending otherwise.
 */
export function applySettings(
  s: GraphicsSettings,
  renderer: THREE.WebGLRenderer,
  sun: THREE.DirectionalLight,
  fog: THREE.Fog | null,
  baseFogNear: number,
  baseFogFar: number,
) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * s.renderScale);

  renderer.shadowMap.enabled = s.shadows !== "off";
  sun.castShadow = s.shadows !== "off";
  if (s.shadows !== "off") {
    const size = SHADOW_SIZE[s.shadows];
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      // The map is allocated lazily, so dropping it forces a rebuild at the
      // new size instead of silently keeping the old one.
      sun.shadow.map?.dispose();
      sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    const range = SHADOW_RANGE[s.shadows];
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -range;
    cam.right = range;
    cam.top = range;
    cam.bottom = -range;
    cam.far = range * 4 + 200;
    cam.updateProjectionMatrix();
  }

  renderer.toneMapping = s.cinematic ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = s.cinematic ? s.exposure : 1;

  if (fog) {
    fog.near = baseFogNear * s.viewDistance;
    fog.far = baseFogFar * s.viewDistance;
  }
}
