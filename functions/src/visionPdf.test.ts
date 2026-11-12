import assert from "node:assert/strict";
import test from "node:test";
import { describeResult, pageBatches, readPagesWithVision, splitByPageMarkers, type VisionPage } from "./visionPdf.ts";

function pages(count: number): VisionPage[] {
  return Array.from({ length: count }, (_, index) => ({
    pageNumber: index + 1,
    jpeg: Buffer.from([0xff, 0xd8, index]),
    fallbackText: `純文字${index + 1}`,
  }));
}

test("pageBatches 依大小分批", () => {
  assert.deepEqual(pageBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(pageBatches([], 3), []);
});

test("splitByPageMarkers 依標記切頁", () => {
  const answer = "=== 第 1 頁 ===\n甲\n\n=== 第 2 頁 ===\n乙\n[圖：曲線]\n=== 第 3 頁 ===\n丙";
  const map = splitByPageMarkers(answer, [1, 2, 3]);
  assert.equal(map.get(1), "甲");
  assert.equal(map.get(2), "乙\n[圖：曲線]");
  assert.equal(map.get(3), "丙");
});

test("splitByPageMarkers 沒有標記時歸給第一頁，並略過不屬於這批的頁碼", () => {
  assert.equal(splitByPageMarkers("只有內容", [4, 5, 6]).get(4), "只有內容");
  const map = splitByPageMarkers("=== 第 9 頁 ===\n外來\n=== 第 4 頁 ===\n本批", [4, 5]);
  assert.equal(map.get(4), "本批");
  assert.equal(map.has(9), false);
});

test("readPagesWithVision 合併各批結果並回報進度", async () => {
  const progress: number[] = [];
  const result = await readPagesWithVision(
    pages(5),
    async (content) => {
      const labels = content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text.match(/^第 (\d+) 頁：$/)?.[1])
        .filter((value): value is string => Boolean(value));
      return labels.map((n) => `=== 第 ${n} 頁 ===\n視覺${n}`).join("\n");
    },
    { batchSize: 2, concurrency: 2, totalPages: 8, onProgress: (done) => void progress.push(done) },
  );
  assert.equal(result.visionPages, 5);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.fallbackPages, []);
  assert.ok(result.text.indexOf("視覺1") < result.text.indexOf("視覺5"));
  assert.equal(Math.max(...progress), 5);
  assert.match(describeResult(result), /只讀取前 5 頁（共 8 頁）/);
});

test("readPagesWithVision 失敗的批次改用純文字，並重試一次", async () => {
  let calls = 0;
  const result = await readPagesWithVision(
    pages(4),
    async (content) => {
      calls += 1;
      const first = content.find((part) => part.type === "text" && /^第 3 頁：$/.test(part.text));
      if (first) throw new Error("boom");
      return "=== 第 1 頁 ===\nA\n=== 第 2 頁 ===\nB";
    },
    { batchSize: 2, concurrency: 1, attempts: 2 },
  );
  assert.equal(calls, 3);
  assert.equal(result.visionPages, 2);
  assert.deepEqual(result.fallbackPages, [3, 4]);
  assert.match(result.text, /=== 第 3 頁 ===\n純文字3/);
  assert.match(describeResult(result), /第 3、4 頁 AI 讀取失敗/);
});

test("readPagesWithVision 超過期限後不再呼叫模型", async () => {
  let calls = 0;
  const result = await readPagesWithVision(
    pages(3),
    async () => {
      calls += 1;
      return "=== 第 1 頁 ===\nx";
    },
    { batchSize: 1, concurrency: 1, deadline: Date.now() - 1 },
  );
  assert.equal(calls, 0);
  assert.equal(result.visionPages, 0);
  assert.deepEqual(result.fallbackPages, [1, 2, 3]);
});
