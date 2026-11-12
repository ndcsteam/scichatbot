import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conversationAccess, conversationTitle, validConversationId } from "./conversation.ts";

describe("conversationAccess", () => {
  it("沒有指定對話時建立新對話", () => {
    assert.equal(conversationAccess(undefined, null, "s1"), "new");
    assert.equal(conversationAccess("", null, "s1"), "new");
  });

  it("對話屬於自己時續用", () => {
    assert.equal(conversationAccess("c1", { studentUid: "s1" }, "s1"), "existing");
  });

  it("拒絕別人的對話", () => {
    assert.equal(conversationAccess("c1", { studentUid: "s2" }, "s1"), "denied");
  });

  it("對話不存在或編號不合法時視為找不到", () => {
    assert.equal(conversationAccess("c1", null, "s1"), "missing");
    assert.equal(conversationAccess("a/b", { studentUid: "s1" }, "s1"), "missing");
    assert.equal(conversationAccess(42, { studentUid: "s1" }, "s1"), "missing");
  });

  it("舊對話的編號就是學生 uid，仍然可以續用", () => {
    assert.equal(conversationAccess("s1", { studentUid: "s1" }, "s1"), "existing");
  });
});

describe("validConversationId", () => {
  it("拒絕空字串、含斜線和過長的編號", () => {
    assert.equal(validConversationId(""), false);
    assert.equal(validConversationId("a/b"), false);
    assert.equal(validConversationId("x".repeat(129)), false);
    assert.equal(validConversationId("abc123"), true);
  });
});

describe("conversationTitle", () => {
  it("短訊息直接當標題，並壓縮空白", () => {
    assert.equal(conversationTitle("  什麼是\n光合作用？ "), "什麼是 光合作用？");
  });

  it("超過 30 個字時截斷並加上刪節號", () => {
    const title = conversationTitle("字".repeat(40));
    assert.equal(Array.from(title).length, 31);
    assert.ok(title.endsWith("…"));
  });
});
