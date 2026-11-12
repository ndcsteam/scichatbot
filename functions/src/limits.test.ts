import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLimits } from "./limits.ts";

describe("resolveLimits", () => {
  it("沒有設定時使用預設值", () => {
    const expected = { historyLimit: 20, maxChars: 4000, maxImages: 5 };
    assert.deepEqual(resolveLimits(undefined), expected);
    assert.deepEqual(resolveLimits(null), expected);
    assert.deepEqual(resolveLimits({}), expected);
    assert.deepEqual(resolveLimits("x"), expected);
  });

  it("接受範圍內的設定", () => {
    assert.deepEqual(resolveLimits({ historyLimit: 10, maxChars: 1000, maxImages: 0 }), {
      historyLimit: 10,
      maxChars: 1000,
      maxImages: 0,
    });
  });

  it("超出上下限時夾回範圍", () => {
    assert.deepEqual(resolveLimits({ historyLimit: 1, maxChars: 99999, maxImages: 99 }), {
      historyLimit: 2,
      maxChars: 8000,
      maxImages: 8,
    });
    assert.deepEqual(resolveLimits({ historyLimit: 0, maxChars: 0, maxImages: -3 }), {
      historyLimit: 2,
      maxChars: 200,
      maxImages: 0,
    });
  });

  it("無效的值退回預設，小數會四捨五入", () => {
    assert.deepEqual(resolveLimits({ historyLimit: "30", maxChars: NaN, maxImages: 2.6 }), {
      historyLimit: 20,
      maxChars: 4000,
      maxImages: 3,
    });
  });
});
