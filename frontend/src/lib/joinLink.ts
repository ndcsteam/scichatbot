import type { JoinDuration } from "../types";

export const JOIN_DURATIONS: ReadonlyArray<{ value: JoinDuration; label: string }> = [
  { value: "3h", label: "3 小時" },
  { value: "24h", label: "24 小時" },
  { value: "7d", label: "一週" },
];

export function joinUrl(token: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${window.location.origin}${base}join/${token}`;
}

export function durationLabel(value: JoinDuration): string {
  return JOIN_DURATIONS.find((item) => item.value === value)?.label ?? value;
}

export function remainingText(expiresAtMs: number, nowMs: number): string {
  const left = expiresAtMs - nowMs;
  if (left <= 0) return "已過期";
  const minutes = Math.ceil(left / 60_000);
  if (minutes < 60) return `還有 ${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `還有約 ${hours} 小時`;
  return `還有約 ${Math.floor(hours / 24)} 天`;
}
