export type HistoryTurn = { role: "user" | "assistant"; content: string };

// 為了讓單元測試不需要載入其他模組，格式化函式由呼叫端傳入（實際用 stripEmoji 與 historyText）。
export type HistoryFormat = {
  cleanAnswer: (text: string) => string;
  userText: (text: string, imageCount: number) => string;
};

const MAX_TURN_CHARS = 20_000;
const MAX_IMAGE_COUNT = 20;

// 老師測試時不會把對話存進資料庫，歷史由前端帶上來；伺服器重新整理並只保留最近 limit 則。
export function parseTestHistory(input: unknown, limit: number, format: HistoryFormat): HistoryTurn[] {
  if (!Array.isArray(input) || limit <= 0) return [];
  const turns: HistoryTurn[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.slice(0, MAX_TURN_CHARS);
    if (role === "assistant") {
      turns.push({ role, content: format.cleanAnswer(text) });
      continue;
    }
    const rawCount = (item as { imageCount?: unknown }).imageCount;
    const imageCount =
      typeof rawCount === "number" && Number.isFinite(rawCount)
        ? Math.min(MAX_IMAGE_COUNT, Math.max(0, Math.floor(rawCount)))
        : 0;
    turns.push({ role, content: format.userText(text, imageCount) });
  }
  return turns.slice(-limit);
}
