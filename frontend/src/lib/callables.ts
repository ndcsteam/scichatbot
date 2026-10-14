import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import type { Role } from "../types";

async function call<T>(name: string, data?: object): Promise<T> {
  if (!functions) throw new Error("尚未設定 Firebase");
  const fn = httpsCallable<object, T>(functions, name);
  const result = await fn(data ?? {});
  return result.data;
}

export function syncUser() {
  return call<{ role: Role; disabled: boolean; displayName: string; email: string }>("syncUser");
}

export function setUserRole(uid: string, role: Role) {
  return call<{ ok: boolean }>("setUserRole", { uid, role });
}

export function setUserDisabled(uid: string, disabled: boolean) {
  return call<{ ok: boolean }>("setUserDisabled", { uid, disabled });
}

export function setBotDisabled(botId: string, disabled: boolean) {
  return call<{ ok: boolean }>("setBotDisabled", { botId, disabled });
}

export function inviteStudent(botId: string, email: string) {
  return call<{ ok: boolean }>("inviteStudent", { botId, email });
}

export function removeStudent(botId: string, studentUid: string) {
  return call<{ ok: boolean }>("removeStudent", { botId, studentUid });
}

export function deleteDocument(botId: string, docId: string) {
  return call<{ ok: boolean }>("deleteDocument", { botId, docId });
}

export function sendMessage(botId: string, content: string) {
  return call<{ answer: string }>("sendMessage", { botId, content });
}
