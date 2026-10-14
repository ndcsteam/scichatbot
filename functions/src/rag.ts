const STOP_WORDS = new Set([
  "的",
  "了",
  "和",
  "與",
  "或",
  "在",
  "是",
  "有",
  "我",
  "你",
  "他",
  "她",
  "它",
  "這",
  "那",
  "一個",
  "我們",
  "什麼",
  "如何",
  "the",
  "a",
  "an",
  "of",
  "to",
  "and",
  "or",
  "in",
  "is",
]);

export type TextChunk = {
  id: string;
  text: string;
};

export function tokenize(text: string): string[] {
  const segmenter = new Intl.Segmenter("zh-Hant", { granularity: "word" });
  const tokens: string[] = [];
  for (const part of segmenter.segment(text.toLowerCase())) {
    if (!part.isWordLike) continue;
    const token = part.segment.trim();
    if (!token || STOP_WORDS.has(token)) continue;
    if (/^[\p{P}\p{S}\d]+$/u.test(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

export function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    chunks.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
  }
  return chunks;
}

export function rankChunks(query: string, chunks: TextChunk[], limit = 5): TextChunk[] {
  const queryCounts = countTokens(tokenize(query));
  if (queryCounts.size === 0) return [];

  return chunks
    .map((chunk) => {
      const chunkTokens = tokenize(chunk.text);
      const chunkCounts = countTokens(chunkTokens);
      let overlap = 0;
      for (const [token, count] of queryCounts) {
        const seen = chunkCounts.get(token) ?? 0;
        if (seen > 0) overlap += Math.min(count, seen);
      }
      const score = chunkTokens.length === 0 ? 0 : overlap / Math.sqrt(chunkTokens.length);
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function buildContext(chunks: TextChunk[], maxChars = 6000): string {
  const parts: string[] = [];
  let used = 0;
  chunks.forEach((chunk, index) => {
    const block = `[${index + 1}] ${chunk.text.trim()}`;
    if (used + block.length > maxChars) return;
    parts.push(block);
    used += block.length + 2;
  });
  return parts.join("\n\n");
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}
