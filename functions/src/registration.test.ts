import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registrationModeFrom, roleForNewAccount } from "./registration.ts";

describe("registrationModeFrom", () => {
  it("只接受自動設為學生，其餘都當作手動批核", () => {
    assert.equal(registrationModeFrom("auto-student"), "auto-student");
    assert.equal(registrationModeFrom("manual"), "manual");
    assert.equal(registrationModeFrom(undefined), "manual");
    assert.equal(registrationModeFrom("teacher"), "manual");
  });
});

describe("roleForNewAccount", () => {
  it("事先指定的管理員電郵一律成為管理員", () => {
    assert.equal(roleForNewAccount("admin@ndc.edu.hk", ["admin@ndc.edu.hk"], "manual"), "admin");
    assert.equal(roleForNewAccount("admin@ndc.edu.hk", ["admin@ndc.edu.hk"], "auto-student"), "admin");
  });

  it("手動批核時，其他新帳號待指派", () => {
    assert.equal(roleForNewAccount("student@ndc.edu.hk", ["admin@ndc.edu.hk"], "manual"), "pending");
  });

  it("自動設為學生時，其他新帳號成為學生", () => {
    assert.equal(roleForNewAccount("student@ndc.edu.hk", ["admin@ndc.edu.hk"], "auto-student"), "student");
  });
});
