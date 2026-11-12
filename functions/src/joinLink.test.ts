import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  joinDurationFrom,
  joinLinkExpired,
  joinLinkExpiry,
  newJoinToken,
  roleAfterJoin,
  validJoinToken,
} from "./joinLink.ts";

describe("joinDurationFrom", () => {
  it("只接受 3 小時、24 小時和一週", () => {
    assert.equal(joinDurationFrom("3h"), "3h");
    assert.equal(joinDurationFrom("24h"), "24h");
    assert.equal(joinDurationFrom("7d"), "7d");
    assert.equal(joinDurationFrom("1h"), null);
    assert.equal(joinDurationFrom(24), null);
    assert.equal(joinDurationFrom(undefined), null);
  });
});

describe("joinLinkExpiry", () => {
  it("依選擇的期限計算到期時間", () => {
    const now = 1_000_000;
    assert.equal(joinLinkExpiry(now, "3h"), now + 3 * 3_600_000);
    assert.equal(joinLinkExpiry(now, "24h"), now + 24 * 3_600_000);
    assert.equal(joinLinkExpiry(now, "7d"), now + 7 * 24 * 3_600_000);
  });
});

describe("joinLinkExpired", () => {
  it("到期當刻和之後都算過期", () => {
    assert.equal(joinLinkExpired(1000, 999), false);
    assert.equal(joinLinkExpired(1000, 1000), true);
    assert.equal(joinLinkExpired(1000, 1001), true);
  });

  it("沒有有效到期時間時當作過期", () => {
    assert.equal(joinLinkExpired(Number.NaN, 0), true);
  });
});

describe("newJoinToken", () => {
  it("產生 32 字元、每次不同、通過格式檢查的權杖", () => {
    const a = newJoinToken();
    const b = newJoinToken();
    assert.equal(a.length, 32);
    assert.notEqual(a, b);
    assert.equal(validJoinToken(a), true);
  });
});

describe("validJoinToken", () => {
  it("拒絕含路徑符號或長度不對的值", () => {
    assert.equal(validJoinToken("a/b"), false);
    assert.equal(validJoinToken("short"), false);
    assert.equal(validJoinToken("x".repeat(33)), false);
    assert.equal(validJoinToken(undefined), false);
  });
});

describe("roleAfterJoin", () => {
  it("學生直接加入，待指派帳號升為學生，老師和管理員不能加入", () => {
    assert.equal(roleAfterJoin("student"), "student");
    assert.equal(roleAfterJoin("pending"), "pending-promoted");
    assert.equal(roleAfterJoin("teacher"), "blocked");
    assert.equal(roleAfterJoin("admin"), "blocked");
  });
});
