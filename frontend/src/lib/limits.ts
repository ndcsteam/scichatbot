// 老師可在「進階設定」調整的上限。上下限需與 functions/src/limits.ts、firestore.rules 一致。
export const LIMIT_BOUNDS = {
  historyLimit: { min: 2, max: 50, fallback: 20 },
  maxChars: { min: 200, max: 8000, fallback: 4000 },
  maxImages: { min: 0, max: 8, fallback: 5 },
} as const;

export type BotLimits = { historyLimit: number; maxChars: number; maxImages: number };

// 所有圖片加起來的大小預算，需小於伺服器的 MAX_TOTAL_IMAGE_BYTES。
export const TOTAL_IMAGE_BUDGET = 5_500_000;
const MAX_ONE_IMAGE = 1_500_000;

export function imageBudget(maxImages: number): number {
  return Math.min(MAX_ONE_IMAGE, Math.floor(TOTAL_IMAGE_BUDGET / Math.max(1, maxImages)));
}

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
