import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { RASTERIZE_DPI, pagesToUdf, type PageImage } from "./udf-build.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Copied out of pdfjs-dist by the pdfjs-assets plugin in vite.config.ts. */
const PDFJS_ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

async function rasterizePdf(
  data: ArrayBuffer,
  onPage: (n: number, total: number) => void,
): Promise<PageImage[]> {
  // The worker fetches these itself only when all of them are set, and CMYK color management needs that.
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: `${PDFJS_ASSETS}cmaps/`,
    iccUrl: `${PDFJS_ASSETS}iccs/`,
    standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSETS}wasm/`,
  });
  try {
    const doc = await loadingTask.promise;
    const pages: PageImage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      onPage(n, doc.numPages);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RASTERIZE_DPI / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      // pdf.js would pick an opaque context, on which Chrome draws text with colored subpixel fringes.
      const canvasContext = canvas.getContext("2d")!;
      await page.render({ canvas: null, canvasContext, viewport, background: "#ffffff" }).promise;
      pages.push({ dataUri: canvas.toDataURL("image/png"), widthPx: canvas.width, heightPx: canvas.height });
      page.cleanup();
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

/** Full pipeline: PDF bytes in, UDF bytes out. Loaded lazily from main.ts. */
export async function pdfToUdf(
  data: ArrayBuffer,
  onPage: (n: number, total: number) => void,
): Promise<Uint8Array> {
  const pages = await rasterizePdf(data, onPage);
  return pagesToUdf(pages);
}
