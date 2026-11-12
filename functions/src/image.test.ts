import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeImages, historyText, imageDataUrl, MAX_IMAGE_BYTES } from "./image.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const jpegBase64 = jpeg.toString("base64");

describe("decodeImages", () => {
  it("沒有圖片時回傳空陣列", () => {
    assert.deepEqual(decodeImages(undefined), { ok: true, images: [] });
    assert.deepEqual(decodeImages([]), { ok: true, images: [] });
  });

  it("接受 JPEG", () => {
    const result = decodeImages([jpegBase64]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.images[0], jpeg);
  });

  it("拒絕不是 JPEG 的內容", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString("base64");
    assert.equal(decodeImages([png]).ok, false);
    assert.equal(decodeImages(["not base64 !!"]).ok, false);
  });

  it("拒絕超過 3 張、非陣列與非字串", () => {
    assert.equal(decodeImages([jpegBase64, jpegBase64, jpegBase64, jpegBase64]).ok, false);
    assert.equal(decodeImages("abc").ok, false);
    assert.equal(decodeImages([123]).ok, false);
    assert.equal(decodeImages([""]).ok, false);
  });

  it("拒絕太大的圖片", () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(MAX_IMAGE_BYTES)]).toString("base64");
    assert.equal(decodeImages([big]).ok, false);
  });
});

describe("imageDataUrl / historyText", () => {
  it("組成 data URL", () => {
    assert.equal(imageDataUrl(jpeg), `data:image/jpeg;base64,${jpegBase64}`);
  });

  it("歷史訊息只標註附圖數量", () => {
    assert.equal(historyText("這是什麼", 0), "這是什麼");
    assert.equal(historyText("這是什麼", 2), "這是什麼\n（學生曾附上 2 張圖片）");
    assert.equal(historyText("", 1), "（學生曾附上 1 張圖片）");
  });
});
