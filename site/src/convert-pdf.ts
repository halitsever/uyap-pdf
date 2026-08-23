import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { RASTERIZE_DPI, pagesToUdf, type PageImage } from "./udf-build.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

async function rasterizePdf(
  data: ArrayBuffer,
  onPage: (n: number, total: number) => void,
): Promise<PageImage[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: PageImage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onPage(n, doc.numPages);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: RASTERIZE_DPI / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ dataUri: canvas.toDataURL("image/png"), widthPx: canvas.width, heightPx: canvas.height });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

/** Full pipeline: PDF bytes in, UDF bytes out. Loaded lazily from main.ts. */
export async function pdfToUdf(
  data: ArrayBuffer,
  onPage: (n: number, total: number) => void,
): Promise<Uint8Array> {
  const pages = await rasterizePdf(data, onPage);
  return pagesToUdf(pages);
}
