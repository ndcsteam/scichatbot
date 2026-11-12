// 只移除以圖示呈現的 Emoji，保留 → ± ° ™ 等科學與排版常用符號。
// 用來整理舊對話裡已經存下的 Emoji；新回覆在伺服器端就已處理。
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}(?=\uFE0F)|[\uFE0F\u200D\u20E3]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/[ \t]+$/gm, "");
}
