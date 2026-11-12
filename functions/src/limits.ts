// 老師可在「進階設定」調整的上限。上下限由系統固定，前端 frontend/src/lib/limits.ts 與 firestore.rules 必須同步。
export const LIMIT_BOUNDS = {
  historyLimit: { min: 2, max: 50, fallback: 20 },
  maxChars: { min: 200, max: 8000, fallback: 4000 },
  maxImages: { min: 0, max: 8, fallback: 5 },
} as const;

export type BotLimits = { historyLimit: number; maxChars: number; maxImages: number };

function pick(value: unknown, bound: { min: number; max: number; fallback: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return bound.fallback;
  return Math.min(bound.max, Math.max(bound.min, Math.round(value)));
}

export function resolveLimits(raw: unknown): BotLimits {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    historyLimit: pick(source.historyLimit, LIMIT_BOUNDS.historyLimit),
    maxChars: pick(source.maxChars, LIMIT_BOUNDS.maxChars),
    maxImages: pick(source.maxImages, LIMIT_BOUNDS.maxImages),
  };
}
