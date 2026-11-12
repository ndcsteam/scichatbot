export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// callable 請求上限約 10 MB（base64 會多 33%），所以所有圖片加起來要留餘裕。
export const MAX_TOTAL_IMAGE_BYTES = 6 * 1000 * 1000;

export type DecodedImages = { ok: true; images: Buffer[] } | { ok: false; message: string };

// 前端會先把圖片縮小並轉成 JPEG，所以伺服器只接受 JPEG（檢查檔頭，不信任前端宣告）。
function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export function decodeImages(input: unknown, maxImages: number): DecodedImages {
  if (input === undefined || input === null) return { ok: true, images: [] };
  if (!Array.isArray(input)) return { ok: false, message: "圖片格式不正確" };
  if (input.length > 0 && maxImages <= 0) return { ok: false, message: "這個聊天機械人不接受圖片" };
  if (input.length > maxImages) return { ok: false, message: `一次最多可以附上 ${maxImages} 張圖片` };
  const images: Buffer[] = [];
  let total = 0;
  for (const item of input) {
    if (typeof item !== "string" || item.length === 0) return { ok: false, message: "圖片格式不正確" };
    if (item.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
      return { ok: false, message: "圖片太大，每張請小於 2 MB" };
    }
    const buffer = Buffer.from(item, "base64");
    if (buffer.length > MAX_IMAGE_BYTES) return { ok: false, message: "圖片太大，每張請小於 2 MB" };
    if (!isJpeg(buffer)) return { ok: false, message: "圖片格式不正確" };
    total += buffer.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) return { ok: false, message: "圖片總共太大，請減少張數或換較小的圖片" };
    images.push(buffer);
  }
  return { ok: true, images };
}

export function imageDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

export function newImagePath(botId: string, conversationId: string, index: number, random: string): string {
  return `chatbots/${botId}/chat/${conversationId}/${index}-${random}.jpg`;
}

// 舊訊息不重送圖片（太貴），只告訴模型當時有附圖。
export function historyText(content: string, imageCount: number): string {
  if (imageCount <= 0) return content;
  const note = `（學生曾附上 ${imageCount} 張圖片）`;
  return content ? `${content}\n${note}` : note;
}

export const IMAGE_ONLY_PROMPT = "請看這張圖片，並依照你的角色說明協助我。";
