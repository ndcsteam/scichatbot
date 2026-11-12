// 只移除以圖示呈現的 Emoji，保留 → ± ° ™ 等科學與排版常用符號。
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}(?=\uFE0F)|[\uFE0F\u200D\u20E3]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, "").replace(/[ \t]+$/gm, "");
}

export const NO_EMOJI_INSTRUCTION = "回答時不要使用 Emoji 或表情符號，只用文字與一般標點。";
