export type ConversationAccess = "new" | "existing" | "missing" | "denied";

export function validConversationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
}

export function conversationAccess(
  requestedId: unknown,
  existing: { studentUid?: unknown } | null,
  studentUid: string,
): ConversationAccess {
  if (requestedId === undefined || requestedId === null || requestedId === "") return "new";
  if (!validConversationId(requestedId) || existing === null) return "missing";
  return existing.studentUid === studentUid ? "existing" : "denied";
}

export function conversationTitle(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length <= 30 ? flat : `${chars.slice(0, 30).join("")}…`;
}
