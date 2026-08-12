import { pick, range, type Rand } from "./random";

/**
 * Weather and the turning year.
 *
 * The point of weather here is not decoration: a cold night is the pressure
 * that makes somebody work out fire, a wet season is what fills the groves,
 * and the first snowfall is an event a colony has to find a word for. The
 * island gets seasons so that the same colony faces the same problem again a
 * year later, having either learned something or not.
 */

export type Sky = "clear" | "cloud" | "rain" | "snow" | "fog";

export type Season = "green" | "high" | "fading" | "cold";

export const SEASON_LABEL: Record<Season, string> = {
  green: "green season",
  high: "high season",
  fading: "the fading",
  cold: "the cold",
};

/** Days in a full turn of the year. */
export const YEAR_LENGTH = 8;

export type WeatherState = {
  sky: Sky;
  /** 0 (bitter) … 1 (hot). */
  warmth: number;
  /** How thickly it is coming down, 0–1, for the renderer. */
  intensity: number;
  /** Lying snow, 0–1. Builds while it snows and melts when it doesn't. */
  settled: number;
  season: Season;
  /** Which turn of the year we are on. */
  year: number;
  next: number;
};

export function initialWeather(): WeatherState {
  return {
    sky: "clear",
    warmth: 0.7,
    intensity: 0,
    settled: 0,
    season: "green",
    year: 1,
    next: 40,
  };
}

export function seasonOf(day: number): Season {
  const phase = (day % YEAR_LENGTH) / YEAR_LENGTH;
  if (phase < 0.25) return "green";
  if (phase < 0.5) return "high";
  if (phase < 0.75) return "fading";
  return "cold";
}

/** Baseline warmth for a season, before night takes its cut. */
const SEASON_WARMTH: Record<Season, number> = {
  green: 0.62,
  high: 0.85,
  fading: 0.45,
  cold: 0.16,
};

/** What the sky is likely to do, per season. */
const SKY_ODDS: Record<Season, Sky[]> = {
  green: ["clear", "clear", "cloud", "rain", "rain", "fog"],
  high: ["clear", "clear", "clear", "cloud", "rain"],
  fading: ["cloud", "cloud", "rain", "rain", "clear", "fog"],
  cold: ["snow", "snow", "cloud", "clear", "fog", "snow"],
};

export type WeatherChange = {
  sky: Sky;
  season: Season;
  seasonChanged: boolean;
};

/**
 * Step the weather. Returns a change when the sky or the season turns, so the
 * colony can react to it — and name it, if it has never seen it before.
 */
export function stepWeather(
  w: WeatherState,
  rand: Rand,
  dt: number,
  day: number,
  nightness: number,
): WeatherChange | null {
  const season = seasonOf(day);
  const seasonChanged = season !== w.season;
  w.season = season;
  w.year = Math.floor(day / YEAR_LENGTH) + 1;

  // Nights are colder than days, and a clear night is colder than a cloudy one.
  const base = SEASON_WARMTH[season];
  const clearNight = w.sky === "clear" ? 0.06 : 0;
  w.warmth = Math.max(0, base - nightness * (0.28 + clearNight));

  w.next -= dt;
  let change: WeatherChange | null = null;
  if (w.next <= 0) {
    w.next = range(rand, 45, 130);
    const sky = pick(rand, SKY_ODDS[season]);
    if (sky !== w.sky) {
      w.sky = sky;
      change = { sky, season, seasonChanged };
    }
  } else if (seasonChanged) {
    change = { sky: w.sky, season, seasonChanged: true };
  }

  const target = w.sky === "rain" ? 1 : w.sky === "snow" ? 0.85 : w.sky === "fog" ? 0.4 : 0;
  w.intensity += (target - w.intensity) * Math.min(1, dt * 0.4);

  // Snow lies where it is cold enough, and goes as soon as it isn't.
  if (w.sky === "snow") w.settled = Math.min(1, w.settled + dt * 0.02);
  else w.settled = Math.max(0, w.settled - dt * (w.warmth > 0.4 ? 0.035 : 0.008));

  return change;
}

export const SKY_LABEL: Record<Sky, string> = {
  clear: "clear",
  cloud: "overcast",
  rain: "rain",
  snow: "snow",
  fog: "fog",
};

/** How badly the cold is biting right now, 0–1. */
export function chill(w: WeatherState) {
  return Math.max(0, 0.35 - w.warmth) / 0.35;
}
