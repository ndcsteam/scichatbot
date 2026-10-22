export type PoeModelChoice = {
  id: string;
  label: string;
  owner: string;
};

const LABS = ["Anthropic", "OpenAI", "Google", "DeepSeek", "XAI", "Meta", "Mistral", "Alibaba", "Moonshot AI"];

export const POE_LAB_LABEL: Record<string, string> = {
  Anthropic: "Anthropic",
  OpenAI: "OpenAI",
  Google: "Google",
  DeepSeek: "DeepSeek",
  XAI: "xAI",
  Meta: "Meta",
  Mistral: "Mistral",
  Alibaba: "Alibaba",
  "Moonshot AI": "Moonshot",
};

const FALLBACK: PoeModelChoice[] = [
  { id: "claude-sonnet-4.6", label: "Claude-Sonnet-4.6", owner: "Anthropic" },
  { id: "claude-haiku-4.5", label: "Claude-Haiku-4.5", owner: "Anthropic" },
  { id: "gpt-4o", label: "GPT-4o", owner: "OpenAI" },
  { id: "gemini-3-flash", label: "Gemini-3-Flash", owner: "Google" },
];

type PoeModelRecord = {
  id?: unknown;
  owned_by?: unknown;
  supported_endpoints?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  metadata?: { display_name?: unknown };
};

let cached: Promise<PoeModelChoice[]> | null = null;

export function loadPoeModels(): Promise<PoeModelChoice[]> {
  if (!cached) {
    cached = fetch("https://api.poe.com/v1/models")
      .then(async (response) => {
        if (!response.ok) throw new Error("無法讀取 Poe 模型");
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
  const choices: PoeModelChoice[] = [];
  for (const item of data) {
    const choice = asChatModel(item);
    if (choice) choices.push(choice);
  }
  return choices.length > 0 ? choices : FALLBACK;
}

export function groupPoeModels(models: PoeModelChoice[]): Array<[string, PoeModelChoice[]]> {
  const grouped = new Map<string, PoeModelChoice[]>();
  for (const model of models) {
    const list = grouped.get(model.owner) ?? [];
    list.push(model);
    grouped.set(model.owner, list);
  }
  return [...grouped.entries()].sort(([left], [right]) => labRank(left) - labRank(right));
}

function asChatModel(value: unknown): PoeModelChoice | null {
  if (!value || typeof value !== "object") return null;
  const item = value as PoeModelRecord;
  const owner = typeof item.owned_by === "string" ? item.owned_by : "";
  if (!LABS.includes(owner)) return null;
  const endpoints = Array.isArray(item.supported_endpoints) ? item.supported_endpoints : [];
  if (!endpoints.includes("/v1/chat/completions")) return null;
  const inputs = modalities(item.architecture?.input_modalities);
  const outputs = modalities(item.architecture?.output_modalities);
  if (!inputs.includes("text") || outputs.length !== 1 || outputs[0] !== "text") return null;
  const id = typeof item.id === "string" ? item.id : "";
  const label = typeof item.metadata?.display_name === "string" && item.metadata.display_name.trim()
    ? item.metadata.display_name.trim()
    : id;
  if (!id || !label) return null;
  return { id, label, owner };
}

function modalities(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function labRank(owner: string): number {
  const index = LABS.indexOf(owner);
  return index === -1 ? LABS.length : index;
}
