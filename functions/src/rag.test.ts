import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContext, chunkText, rankChunks, tokenize } from "./rag.ts";

describe("chunkText", () => {
  it("以重疊方式切開長文", () => {
    const text = "甲".repeat(1200);
    const chunks = chunkText(text, 1000, 150);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 1000);
    assert.equal(chunks[1].length, 350);
  });

  it("空字串不會產生片段", () => {
    assert.deepEqual(chunkText("   "), []);
  });
});

describe("rankChunks", () => {
  it("把與問題用詞重疊較多的片段排在前面", () => {
    const ranked = rankChunks("光合作用為什麼需要光？", [
      { id: "volcano", text: "火山噴發時岩漿流出地面，形成火山灰。" },
      { id: "photo", text: "光合作用在葉綠體進行，植物需要光、水和二氧化碳。" },
    ]);
    assert.equal(ranked[0]?.id, "photo");
  });

  it("沒有重疊時不回傳片段", () => {
    assert.deepEqual(rankChunks("光合作用", [{ id: "a", text: "火山與岩漿" }]), []);
  });
});

describe("tokenize", () => {
  it("略過停用詞", () => {
    assert.equal(tokenize("這是光合作用").includes("是"), false);
    assert.equal(tokenize("這是光合作用").includes("光合作用"), true);
  });
});

describe("buildContext", () => {
  it("超過字數上限時停止附加", () => {
    const context = buildContext(
      [
        { id: "1", text: "甲".repeat(20) },
        { id: "2", text: "乙".repeat(20) },
      ],
      30,
    );
    assert.equal(context.includes("甲"), true);
    assert.equal(context.includes("乙"), false);
  });
});
