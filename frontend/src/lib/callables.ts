import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import type { JoinDuration, RegistrationMode, Role } from "../types";

async function call<T>(name: string, data?: object): Promise<T> {
  if (!functions) throw new Error("尚未設定 Firebase");
  const fn = httpsCallable<object, T>(functions, name);
  const result = await fn(data ?? {});
  return result.data;
}

export function syncUser() {
  return call<{ role: Role; disabled: boolean; displayName: string; email: string }>("syncUser");
}

export function setRegistrationMode(mode: RegistrationMode) {
  return call<{ mode: RegistrationMode }>("setRegistrationMode", { mode });
}

export function setUserRole(uid: string, role: Role) {
  return call<{ ok: boolean }>("setUserRole", { uid, role });
}

export function setUserDisabled(uid: string, disabled: boolean) {
  return call<{ ok: boolean }>("setUserDisabled", { uid, disabled });
}

export function deleteStudent(uid: string) {
  return call<{ ok: boolean }>("deleteStudent", { uid });
}

export function setBotDisabled(botId: string, disabled: boolean) {
  return call<{ ok: boolean }>("setBotDisabled", { botId, disabled });
}

export function deleteChatbot(botId: string) {
  return call<{ ok: boolean }>("deleteChatbot", { botId });
}

export function createJoinLink(botId: string, duration: JoinDuration) {
  return call<{ token: string; expiresAt: number }>("createJoinLink", { botId, duration });
}

export function revokeJoinLink(botId: string) {
  return call<{ ok: boolean }>("revokeJoinLink", { botId });
}

export function joinWithLink(token: string) {
  return call<{ botId: string; botName: string; promoted: boolean }>("joinWithLink", { token });
}

export function removeStudent(botId: string, studentUid: string) {
  return call<{ ok: boolean }>("removeStudent", { botId, studentUid });
}

export function deleteDocument(botId: string, docId: string) {
  return call<{ ok: boolean }>("deleteDocument", { botId, docId });
}

export function sendMessage(botId: string, content: string, conversationId?: string, images: string[] = []) {
  return call<{ answer: string; conversationId: string }>("sendMessage", {
    botId,
    content,
    ...(images.length > 0 ? { images } : {}),
    ...(conversationId ? { conversationId } : {}),
  });
}

export type TestTurn = { role: "user" | "assistant"; content: string; imageCount?: number };

export function testChat(botId: string, content: string, history: TestTurn[], images: string[] = []) {
  return call<{ answer: string }>("testChat", {
    botId,
    content,
    history,
    ...(images.length > 0 ? { images } : {}),
  });
}
