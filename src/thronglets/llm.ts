/**
 * Optional LLM bridge.
 *
 * The colony runs perfectly well without this — every piece of text it needs
 * has a procedural fallback. Connect a model and it starts writing the
 * colony's scripture instead: naming gods, wording creeds, voicing a creature
 * you've selected, and turning the event log into a chronicle.
 *
 * Everything runs in the browser against an endpoint the player supplies, so
 * a local model (Ollama, LM Studio, llama.cpp) works with no key at all, and
 * nothing about the configuration leaves the machine.
 */

export type LlmProvider = "ollama" | "openai" | "anthropic";

export type LlmConfig = {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

const STORAGE_KEY = "thronglets-llm";

export const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { baseUrl: string; model: string; needsKey: boolean; label: string; hint: string }
> = {
  ollama: {
    label: "Local (Ollama)",
    baseUrl: "http://localhost:11434",
    model: "llama3.2",
    needsKey: false,
    hint: "Run `ollama serve`, then `ollama pull llama3.2`. Start it with OLLAMA_ORIGINS=* so the page is allowed to call it.",
  },
  openai: {
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com",
    model: "gpt-4o-mini",
    needsKey: true,
    hint: "Any server speaking the /v1/chat/completions API — OpenAI, LM Studio, vLLM, OpenRouter.",
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    needsKey: true,
    hint: "Calls /v1/messages directly from the browser, which needs the direct-browser-access header (sent for you).",
  },
};

export function defaultConfig(): LlmConfig {
  return {
    enabled: false,
    provider: "ollama",
    baseUrl: PROVIDER_DEFAULTS.ollama.baseUrl,
    model: PROVIDER_DEFAULTS.ollama.model,
    apiKey: "",
  };
}

export function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    return { ...defaultConfig(), ...(JSON.parse(raw) as Partial<LlmConfig>) };
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(cfg: LlmConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Private browsing, quota, whatever — the sim carries on regardless.
  }
}

export class LlmError extends Error {}

const TIMEOUT_MS = 20000;

/**
 * One completion. Throws LlmError with something a player can act on — the
 * callers all catch it and fall back to procedural text.
 */
export async function complete(
  cfg: LlmConfig,
  prompt: string,
  opts: { system?: string; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  if (!cfg.model.trim()) throw new LlmError("No model name set.");
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const maxTokens = opts.maxTokens ?? 220;
  const system =
    opts.system ??
    "You write for a tiny god-game about voxel creatures called thronglets. Answer in plain prose, no preamble, no markdown, no quotation marks around the whole answer.";

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const signal = opts.signal ?? timeout.signal;

  try {
    let url: string;
    let body: unknown;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (cfg.provider === "ollama") {
      url = `${base}/api/chat`;
      body = {
        model: cfg.model,
        stream: false,
        options: { num_predict: maxTokens, temperature: 0.9 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      };
    } else if (cfg.provider === "anthropic") {
      url = `${base}/v1/messages`;
      headers["x-api-key"] = cfg.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      body = {
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      };
    } else {
      url = `${base}/v1/chat/completions`;
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
      body = {
        model: cfg.model,
        max_tokens: maxTokens,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new LlmError(`${res.status} ${res.statusText}. ${detail}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const text = extractText(cfg.provider, data);
    if (!text) throw new LlmError("The model returned nothing.");
    return text.trim();
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if ((err as Error)?.name === "AbortError")
      throw new LlmError("Timed out waiting for the model.");
    // fetch() rejects with a bare TypeError for CORS and connection failures.
    throw new LlmError(
      `Could not reach ${base}. Check the server is running and allows requests from this page.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function extractText(provider: LlmProvider, data: Record<string, any>): string {
  if (provider === "ollama") return data?.message?.content ?? data?.response ?? "";
  if (provider === "anthropic") {
    const blocks = data?.content;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b) => b?.type === "text")
        .map((b) => b.text)
        .join("\n");
    }
    return "";
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

export type FaithSeed = {
  clan: string;
  sacred: string;
  heresyOf?: string | null;
};

/** Ask for a god and a creed. Returns null rather than throwing. */
export async function inventFaith(
  cfg: LlmConfig,
  seed: FaithSeed,
): Promise<{ deity: string; creed: string } | null> {
  const prompt = [
    `A clan of small voxel creatures called the ${seed.clan} has settled and needs a religion.`,
    `They hold ${seed.sacred} sacred.`,
    seed.heresyOf
      ? `Their faith broke away from the worship of ${seed.heresyOf}, and runs hotter than it.`
      : "",
    "",
    "Give exactly two lines and nothing else:",
    "1. The name of their god — one invented word, no title.",
    "2. Their creed — one sentence, under twelve words, plain and a little unsettling.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const out = await complete(cfg, prompt, { maxTokens: 120 });
    const lines = out
      .split("\n")
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return null;
    return { deity: lines[0].slice(0, 24), creed: lines[1].slice(0, 120) };
  } catch {
    return null;
  }
}

export type CreatureBrief = {
  name: string;
  clan: string;
  deity: string;
  creed: string;
  stage: string;
  age: number;
  parents: string | null;
  task: string;
  hunger: number;
  thirst: number;
  energy: number;
  spirit: number;
  kills: number;
  blocksPlaced: number;
  children: number;
  atWarWith: string[];
};

/** First-person interior monologue for the creature under the cursor. */
export async function voiceOf(cfg: LlmConfig, c: CreatureBrief): Promise<string> {
  const pct = (v: number) => Math.round(v * 100);
  const prompt = [
    `You are ${c.name}, a small yellow creature in the ${c.clan} clan.`,
    `You worship ${c.deity}. Your clan's creed: "${c.creed}".`,
    `You are ${c.stage}, ${Math.floor(c.age)} seconds old.`,
    c.parents ? `Your parents were ${c.parents}.` : "You are one of the first eight, with no parents.",
    `Right now you are ${c.task}.`,
    `Hunger ${pct(c.hunger)}%, thirst ${pct(c.thirst)}%, tiredness ${pct(c.energy)}%, unmet devotion ${pct(c.spirit)}%.`,
    `You have laid ${c.blocksPlaced} blocks, have ${c.children} children, and have killed ${c.kills}.`,
    c.atWarWith.length ? `Your clan is at war with the ${c.atWarWith.join(" and ")}.` : "Your clan is at peace.",
    "",
    "Say what is in your head, in two or three short sentences. First person, present tense. Small thoughts, small words. You do not know you are in a simulation.",
  ].join("\n");
  return complete(cfg, prompt, { maxTokens: 160 });
}

/** Turn the raw event log into something a historian would write. */
export async function chronicle(
  cfg: LlmConfig,
  events: string[],
  clans: { name: string; deity: string; members: number }[],
): Promise<string> {
  const prompt = [
    "These things happened on a small island, most recent last:",
    ...events.map((e) => `- ${e}`),
    "",
    "The peoples of the island:",
    ...clans.map((c) => `- The ${c.name}, ${c.members} strong, who worship ${c.deity}.`),
    "",
    "Write this up as a passage of scripture or chronicle: four or five sentences, grave and plain, as if written long afterwards by someone who survived it.",
  ].join("\n");
  return complete(cfg, prompt, { maxTokens: 320 });
}
