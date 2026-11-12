export const MAX_IMAGES = 3;

const MAX_EDGE = 1568;
const MAX_BYTES = 1_500_000;

export type PreparedImage = {
  id: string;
  base64: string;
  previewUrl: string;
};

// 在瀏覽器內縮小並轉成 JPEG：節省流量，也讓手機相片（可能很大）能順利上傳。
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("只能上載圖片檔案");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("無法讀取這張圖片，請改用 JPG 或 PNG");
  });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法處理圖片");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    for (const quality of [0.85, 0.75, 0.65, 0.5]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) break;
    }
    if (!blob || blob.size > MAX_BYTES) throw new Error("圖片太大，請換一張較小的圖片");
    return {
      id: crypto.randomUUID(),
      base64: await toBase64(blob),
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    bitmap.close();
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("無法讀取這張圖片"));
    reader.readAsDataURL(blob);
  });
}
