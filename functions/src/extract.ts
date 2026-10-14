import { chunkText } from "./rag.js";

const MAX_TEXT = 200_000;

export async function extractPlainText(buffer: Buffer, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  let text = "";
  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    text = buffer.toString("utf8");
  } else {
    throw new Error("只接受 txt、md 或 pdf");
  }
  return text.replace(/\u0000/g, "").slice(0, MAX_TEXT);
}

export function splitDocument(text: string): string[] {
  return chunkText(text).filter((part) => part.trim().length > 0);
}
