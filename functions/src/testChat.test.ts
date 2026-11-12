import assert from "node:assert/strict";
import test from "node:test";
import { stripEmoji } from "./emoji.ts";
import { historyText } from "./image.ts";
import { parseTestHistory as parse } from "./testChat.ts";

const format = { cleanAnswer: stripEmoji, userText: historyText };
const parseTestHistory = (input: unknown, limit: number) => parse(input, limit, format);

test("parseTestHistory 只保留最近 limit 則", () => {
  const input = Array.from({ length: 6 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `訊息${index}`,
  }));
  const turns = parseTestHistory(input, 3);
  assert.deepEqual(
    turns.map((item) => item.content),
    ["訊息3", "訊息4", "訊息5"],
  );
});

test("parseTestHistory 忽略不合法的項目", () => {
  const turns = parseTestHistory(
    [null, "x", { role: "system", content: "壞" }, { role: "user", content: 5 }, { role: "user", content: "好" }],
    10,
  );
  assert.deepEqual(turns, [{ role: "user", content: "好" }]);
  assert.deepEqual(parseTestHistory("不是陣列", 10), []);
  assert.deepEqual(parseTestHistory([{ role: "user", content: "好" }], 0), []);
});

test("parseTestHistory 為附圖的提問加註記，並移除 AI 回覆的 emoji", () => {
  const turns = parseTestHistory(
    [
      { role: "user", content: "看圖", imageCount: 2 },
      { role: "assistant", content: "好的😀" },
    ],
    10,
  );
  assert.equal(turns[0]?.content, "看圖\n（學生曾附上 2 張圖片）");
  assert.equal(turns[1]?.content, "好的");
});

test("parseTestHistory 限制單則長度與圖片數", () => {
  const turns = parseTestHistory([{ role: "user", content: "字".repeat(30_000), imageCount: 999 }], 5);
  assert.ok((turns[0]?.content.length ?? 0) < 20_100);
  assert.match(turns[0]?.content ?? "", /曾附上 20 張圖片/);
});
