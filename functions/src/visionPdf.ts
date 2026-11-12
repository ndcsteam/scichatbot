// 以 AI 視覺閱讀 PDF：把每頁畫成圖片，交給支援圖片的模型轉錄成文字，
// 並把科學圖片、圖表、示意圖與公式用文字詳細描述，之後再切段供 RAG 檢索。

export const VISION_BATCH_SIZE = 3;
export const VISION_CONCURRENCY = 4;
export const MAX_VISION_PAGES = 60;
export const PAGE_IMAGE_WIDTH = 1400;

export type VisionContent = Array<
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
>;
export type VisionAsk = (content: VisionContent) => Promise<string>;

export type VisionPage = { pageNumber: number; jpeg: Buffer; fallbackText: string };

export type VisionResult = {
  text: string;
  pageCount: number;
  readPages: number;
  visionPages: number;
  fallbackPages: number[];
  truncated: boolean;
};

export function visionPrompt(first: number, last: number): string {
  return [
    `以下是一份教學資料 PDF 的第 ${first} 至第 ${last} 頁，依序附上頁面圖片。`,
    "請把每一頁完整轉錄成可供搜尋的純文字，規則：",
    "1. 忠實保留原文的語言、標題、段落與清單，不要翻譯、不要摘要、不要加入頁面上沒有的內容。",
    "2. 數學與化學公式用純文字或 LaTeX 寫出，例如 6CO2 + 6H2O -> C6H12O6 + 6O2。",
    "3. 表格用 Markdown 表格。",
    "4. 遇到圖片、照片、圖表、曲線圖、示意圖、實驗裝置圖、流程圖，請在原位置寫成「[圖：...]」，詳細描述：圖的類型、圖中標示的所有文字與標籤、座標軸名稱與單位、數據趨勢或關鍵數值、各部分之間的關係，以及它想說明的科學概念。描述用繁體中文。",
    "5. 圖中或文中的專有名詞，盡量同時寫出中文與英文原文，方便日後搜尋。",
    "6. 每一頁以單獨一行「=== 第 N 頁 ===」開始，N 為該頁在整份 PDF 中的頁碼。",
    "7. 頁首頁尾的頁碼與重複的版權文字可以略過。不要使用 emoji。只輸出轉錄內容，不要加任何開場白或說明。",
  ].join("\n");
}

export function pageMarker(pageNumber: number): string {
  return `=== 第 ${pageNumber} 頁 ===`;
}

export function pageBatches<T>(pages: T[], size = VISION_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < pages.length; index += size) batches.push(pages.slice(index, index + size));
  return batches;
}

// 模型可能漏掉分頁標記；沒有任何標記時，整段歸給批次第一頁。
export function splitByPageMarkers(answer: string, pageNumbers: number[]): Map<number, string> {
  const result = new Map<number, string>();
  const marker = /^[ \t]*=+\s*第\s*(\d+)\s*頁\s*=+[ \t]*$/gm;
  const found: Array<{ page: number; start: number; end: number }> = [];
  for (const match of answer.matchAll(marker)) {
    found.push({ page: Number(match[1]), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  const allowed = new Set(pageNumbers);
  const usable = found.filter((item) => allowed.has(item.page));
  if (usable.length === 0) {
    const first = pageNumbers[0];
    if (first !== undefined && answer.trim()) result.set(first, answer.trim());
    return result;
  }
  usable.forEach((item, index) => {
    const next = usable[index + 1];
    const body = answer.slice(item.end, next ? next.start : answer.length).trim();
    if (body) result.set(item.page, `${result.get(item.page) ?? ""}${result.has(item.page) ? "\n" : ""}${body}`);
  });
  return result;
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await work(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function readPagesWithVision(
  pages: VisionPage[],
  ask: VisionAsk,
  options: {
    totalPages?: number;
    batchSize?: number;
    concurrency?: number;
    attempts?: number;
    // 超過這個時間點（Date.now() 毫秒）後不再呼叫模型，其餘頁面改用純文字。
    deadline?: number;
    onProgress?: (done: number, total: number) => void | Promise<void>;
  } = {},
): Promise<VisionResult> {
  const batches = pageBatches(pages, options.batchSize ?? VISION_BATCH_SIZE);
  const attempts = options.attempts ?? 2;
  let finished = 0;

  const outputs = await mapLimit(batches, options.concurrency ?? VISION_CONCURRENCY, async (batch) => {
    const numbers = batch.map((page) => page.pageNumber);
    const first = numbers[0] ?? 0;
    const last = numbers[numbers.length - 1] ?? first;
    const content: VisionContent = [{ type: "text", text: visionPrompt(first, last) }];
    for (const page of batch) {
      content.push({ type: "text", text: `第 ${page.pageNumber} 頁：` });
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${page.jpeg.toString("base64")}` } });
    }
    let parts: Map<number, string> | null = null;
    for (let attempt = 0; attempt < attempts && !parts; attempt++) {
      if (options.deadline !== undefined && Date.now() > options.deadline) break;
      try {
        const answer = await ask(content);
        const split = splitByPageMarkers(answer, numbers);
        if (split.size > 0) parts = split;
      } catch {
        parts = null;
      }
    }
    finished += batch.length;
    await options.onProgress?.(finished, pages.length);
    return { batch, parts };
  });

  const sections: string[] = [];
  const fallbackPages: number[] = [];
  let visionPages = 0;
  for (const { batch, parts } of outputs) {
    for (const page of batch) {
      const visionText = parts?.get(page.pageNumber)?.trim();
      if (visionText) {
        visionPages += 1;
        sections.push(`${pageMarker(page.pageNumber)}\n${visionText}`);
        continue;
      }
      fallbackPages.push(page.pageNumber);
      const plain = page.fallbackText.trim();
      if (plain) sections.push(`${pageMarker(page.pageNumber)}\n${plain}`);
    }
  }

  const pageCount = options.totalPages ?? pages.length;
  return {
    text: sections.join("\n\n"),
    pageCount,
    readPages: pages.length,
    visionPages,
    fallbackPages,
    truncated: pageCount > pages.length,
  };
}

export function describeResult(result: VisionResult): string {
  const notes: string[] = [];
  if (result.truncated) notes.push(`只讀取前 ${result.readPages} 頁（共 ${result.pageCount} 頁）`);
  if (result.fallbackPages.length > 0) {
    notes.push(`第 ${result.fallbackPages.join("、")} 頁 AI 讀取失敗，已改用純文字`);
  }
  return notes.join("；");
}

type PdfProxy = { numPages: number };

// 把 PDF 每頁畫成 JPEG。@napi-rs/canvas 只在需要時才載入。
export async function renderPdfPages(
  buffer: Buffer,
  maxPages = MAX_VISION_PAGES,
): Promise<{ pages: VisionPage[]; totalPages: number }> {
  const unpdf = await import("unpdf");
  const canvasImport = () => import("@napi-rs/canvas");
  const { createCanvas, loadImage } = await canvasImport();
  const pdf = (await unpdf.getDocumentProxy(new Uint8Array(buffer))) as unknown as PdfProxy &
    Parameters<typeof unpdf.extractText>[0];
  const totalPages = pdf.numPages;
  const readCount = Math.min(totalPages, maxPages);

  const textResult = await unpdf.extractText(pdf, { mergePages: false });
  const perPage = Array.isArray(textResult.text) ? textResult.text : [textResult.text];

  const pages: VisionPage[] = [];
  for (let pageNumber = 1; pageNumber <= readCount; pageNumber++) {
    const png = await unpdf.renderPageAsImage(pdf, pageNumber, { canvasImport, width: PAGE_IMAGE_WIDTH });
    const image = await loadImage(Buffer.from(png));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);
    pages.push({
      pageNumber,
      jpeg: canvas.toBuffer("image/jpeg", 82),
      fallbackText: String(perPage[pageNumber - 1] ?? ""),
    });
  }
  return { pages, totalPages };
}
