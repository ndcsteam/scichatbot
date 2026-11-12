import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripEmoji } from "./emoji.ts";

describe("stripEmoji", () => {
  it("移除常見的表情符號", () => {
    assert.equal(stripEmoji("你好！😊"), "你好！");
    assert.equal(stripEmoji("完成了 ✅ 很好 🎉"), "完成了  很好");
    assert.equal(stripEmoji("加油💪，繼續努力🌟"), "加油，繼續努力");
  });

  it("移除帶變體符號、膚色和組合的 Emoji", () => {
    assert.equal(stripEmoji("小心 ⚠️ 注意"), "小心  注意");
    assert.equal(stripEmoji("好 👍🏽"), "好");
    assert.equal(stripEmoji("家人 👨‍👩‍👧"), "家人");
  });

  it("保留科學與排版常用符號", () => {
    const text = "H₂O → H⁺ + OH⁻，溫度 25°C，± 0.5，α、β、Δ，2 × 3 ≈ 6，™ © ↑ ↓";
    assert.equal(stripEmoji(text), text);
  });

  it("保留中文、數字、Markdown 符號和換行", () => {
    const text = "**重點**\n\n- 一\n- 二\n\n1. 第一步";
    assert.equal(stripEmoji(text), text);
  });

  it("每行行尾因移除而留下的空白會清掉", () => {
    assert.equal(stripEmoji("第一行 😀\n第二行"), "第一行\n第二行");
  });
});
