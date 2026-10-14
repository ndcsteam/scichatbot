export const DEFAULT_MODEL = "Claude-Sonnet-4.6";

export const DEFAULT_SYSTEM_PROMPT =
  "你是一位科學科學習助教，用繁體中文回答學生。解釋要清楚，並在適當時舉出例子。";

export const DEFAULT_WELCOME = "你好，我是這科的學習助教。有問題可以直接問我。";

export const ROLE_LABEL = {
  admin: "管理員",
  teacher: "老師",
  student: "學生",
  pending: "待指派",
} as const;
