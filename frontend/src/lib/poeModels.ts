export type PoeModelChoice = {
  id: string;
  label: string;
  owner: string;
};

const PRICE_BAND = 2;
const GOOGLE_MODEL_ID = "gemini-3.8-flash";
const LEGACY_DEFAULTS = new Set(["claude-sonnet-4.6"]);

export const DEFAULT_MODEL_LABEL = "Gemini 3.8 Flash";

const OWNER_ORDER = ["Google", "Anthropic", "OpenAI", "XAI", "Mistral", "DeepSeek", "Meta", "Alibaba", "Moonshot AI"];

export const POE_LAB_LABEL: Record<string, string> = {
  Google: "Google",
  Anthropic: "Anthropic",
  OpenAI: "OpenAI",
  XAI: "xAI",
  Mistral: "Mistral",
  DeepSeek: "DeepSeek",
  Meta: "Meta",
  Alibaba: "Alibaba",
  "Moonshot AI": "Moonshot",
};

const FALLBACK: PoeModelChoice[] = [
  { id: "gemini-3.8-flash", label: "Gemini-3.8-Flash", owner: "Google" },
  { id: "claude-haiku-4.5", label: "Claude-Haiku-4.5", owner: "Anthropic" },
  { id: "gpt-5.4-mini", label: "GPT-5.4-Mini", owner: "OpenAI" },
  { id: "grok-4.3", label: "Grok-4.3", owner: "XAI" },
];

type PoeModelRecord = {
  id?: unknown;
  owned_by?: unknown;
  supported_endpoints?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  metadata?: { display_name?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown } | null;
};

type PricedModel = PoeModelChoice & {
  prompt: number;
  completion: number;
};

let cached: Promise<PoeModelChoice[]> | null = null;

export function loadPoeModels(): Promise<PoeModelChoice[]> {
  if (!cached) {
    cached = fetch("https://api.poe.com/v1/models")
      .then(async (response) => {
        if (!response.ok) throw new Error("無法讀取 AI 模型");
        return chatModels(await response.json());
      })
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

export function chatModels(body: unknown): PoeModelChoice[] {
  const data = body && typeof body === "object" && "data" in body && Array.isArray(body.data) ? body.data : [];
  const priced = data.flatMap((item) => {
    const model = asPricedModel(item);
    return model ? [model] : [];
  });
  const google = priced.find((item) => item.id.toLowerCase() === GOOGLE_MODEL_ID);
  if (!google) return FALLBACK;

  const chosen = new Map<string, PoeModelChoice>([[google.owner, { id: google.id, label: google.label, owner: google.owner }]]);
  for (const owner of new Set(priced.map((item) => item.owner))) {
    if (owner === google.owner) continue;
    const best = closestModel(
      priced.filter((item) => item.owner === owner),
      google.prompt,
      google.completion,
    );
    if (best) chosen.set(owner, { id: best.id, label: best.label, owner: best.owner });
  }
  return [...chosen.values()].sort((left, right) => ownerRank(left.owner) - ownerRank(right.owner) || left.label.localeCompare(right.label));
}

export function modelOptionLabel(model: PoeModelChoice): string {
  if (model.id.toLowerCase() === GOOGLE_MODEL_ID || model.label.toLowerCase() === "gemini-3.8-flash") {
    return DEFAULT_MODEL_LABEL;
  }
  return model.label;
}

export function selectedModelValue(stored: string, models: PoeModelChoice[]): string {
  const gemini = models.find((item) => item.id.toLowerCase() === GOOGLE_MODEL_ID)?.label ?? "Gemini-3.8-Flash";
  const value = stored.trim();
  if (!value || LEGACY_DEFAULTS.has(value.toLowerCase())) return gemini;
  const match = models.find(
    (item) => item.label.toLowerCase() === value.toLowerCase() || item.id.toLowerCase() === value.toLowerCase(),
  );
  return match?.label ?? value;
}

export function groupPoeModels(models: PoeModelChoice[]): Array<[string, PoeModelChoice[]]> {
  const grouped = new Map<string, PoeModelChoice[]>();
  for (const model of models) {
    const list = grouped.get(model.owner) ?? [];
    list.push(model);
    grouped.set(model.owner, list);
  }
  return [...grouped.entries()].sort(([left], [right]) => ownerRank(left) - ownerRank(right));
}

function closestModel(models: PricedModel[], prompt: number, completion: number): PricedModel | null {
  const near = models.filter((item) => inBand(item.prompt, prompt) && inBand(item.completion, completion));
  near.sort((left, right) => priceDistance(left, prompt, completion) - priceDistance(right, prompt, completion) || left.label.localeCompare(right.label));
  return near[0] ?? null;
}

function asPricedModel(value: unknown): PricedModel | null {
  if (!value || typeof value !== "object") return null;
  const item = value as PoeModelRecord;
  const endpoints = Array.isArray(item.supported_endpoints) ? item.supported_endpoints : [];
  if (!endpoints.includes("/v1/chat/completions")) return null;
  const inputs = modalities(item.architecture?.input_modalities);
  const outputs = modalities(item.architecture?.output_modalities);
  if (!inputs.includes("text") || !inputs.includes("image") || !outputs.includes("text")) return null;
  const prompt = numberOrNull(item.pricing?.prompt);
  const completion = numberOrNull(item.pricing?.completion);
  const owner = typeof item.owned_by === "string" ? item.owned_by : "";
  const id = typeof item.id === "string" ? item.id : "";
  const label = typeof item.metadata?.display_name === "string" && item.metadata.display_name.trim()
    ? item.metadata.display_name.trim()
    : id;
  if (!owner || !id || !label || prompt === null || completion === null) return null;
  return { id, label, owner, prompt, completion };
}

function inBand(value: number, reference: number): boolean {
  return value >= reference / PRICE_BAND && value <= reference * PRICE_BAND;
}

function priceDistance(model: PricedModel, prompt: number, completion: number): number {
  return Math.abs(model.prompt - prompt) / prompt + Math.abs(model.completion - completion) / completion;
}

function modalities(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ownerRank(owner: string): number {
  const index = OWNER_ORDER.indexOf(owner);
  return index === -1 ? OWNER_ORDER.length : index;
}
