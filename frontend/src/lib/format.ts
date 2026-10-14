import { FirebaseError } from "firebase/app";
import type { Timestamp } from "firebase/firestore";

export function errorText(error: unknown): string {
  if (error instanceof FirebaseError) {
    return error.message.replace(/^Firebase:\s*/i, "") || "操作失敗";
  }
  if (error instanceof Error) return error.message;
  return "發生未知錯誤";
}

export function formatTime(value?: Timestamp): string {
  if (!value || typeof value.toDate !== "function") return "";
  return value.toDate().toLocaleString("zh-HK", { hour12: false });
}

export function basename(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}
