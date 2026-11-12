import { randomBytes } from "node:crypto";

export type JoinDuration = "3h" | "24h" | "7d";

const HOUR = 60 * 60 * 1000;

const DURATION_MS: Record<JoinDuration, number> = {
  "3h": 3 * HOUR,
  "24h": 24 * HOUR,
  "7d": 7 * 24 * HOUR,
};

export function joinDurationFrom(value: unknown): JoinDuration | null {
  return value === "3h" || value === "24h" || value === "7d" ? value : null;
}

export function joinLinkExpiry(nowMs: number, duration: JoinDuration): number {
  return nowMs + DURATION_MS[duration];
}

export function joinLinkExpired(expiresAtMs: number, nowMs: number): boolean {
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs;
}

export function newJoinToken(): string {
  return randomBytes(24).toString("base64url");
}

export function validJoinToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function roleAfterJoin(role: unknown): "student" | "pending-promoted" | "blocked" {
  if (role === "student") return "student";
  if (role === "pending") return "pending-promoted";
  return "blocked";
}
