/** Browser side of UDF to PDF: loaded lazily, so the pages stay light until a file is chosen. */
import pdfMake from "pdfmake/build/pdfmake.js";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Block, ImageData, UdfDocument } from "./model.js";
import { readUdf } from "./parse.js";
import { renderPdf, type PdfMake } from "./render-pdf.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const FONT_URLS = import.meta.glob<string>("./fonts/*.woff", { query: "?url", import: "default", eager: true });

async function loadFont(file: string): Promise<Uint8Array> {
  const url = FONT_URLS[`./fonts/${file}.woff`];
  if (!url) throw new Error(`Unknown font ${file}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font ${file}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** pdfkit embeds only PNG and JPEG, so other image types are redrawn as PNG first. */
async function toPng(image: ImageData): Promise<ImageData> {
  if (image.mime === "image/png" || image.mime === "image/jpeg") return image;
  try {
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mime }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return { base64: canvas.toDataURL("image/png").split(",")[1], mime: "image/png" };
  } catch {
    return image;
  }
}

async function convertImages(blocks: Block[]): Promise<void> {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      for (const run of block.inlines) if (run.type === "image") run.image = await toPng(run.image);
    } else if (block.type === "table") {
      for (const row of block.rows) for (const cell of row.cells) await convertImages(cell.blocks);
    }
  }
}

export interface Converted {
  doc: UdfDocument;
  pdf: Uint8Array;
}

export async function convertUdf(data: ArrayBuffer): Promise<Converted> {
  const doc = await readUdf(data);
  await convertImages(doc.body);
  if (doc.header) await convertImages(doc.header.blocks);
  if (doc.footer) await convertImages(doc.footer.blocks);
  if (doc.background) doc.background.image = await toPng(doc.background.image);
  const pdf = await renderPdf(pdfMake as unknown as PdfMake, doc, loadFont);
  return { doc, pdf };
}

export interface Preview {
  pageCount: number;
  destroy(): Promise<void>;
}

/**
 * Shows the generated PDF page by page, so the preview is exactly what downloads.
 * Pages render when they scroll near the viewport.
 */
export async function showPreview(pdf: Uint8Array, container: HTMLElement, pageLabel: (n: number, total: number) => string): Promise<Preview> {
  // pdf.js transfers the buffer to its worker, so hand it a copy.
  const loadingTask = pdfjs.getDocument({ data: pdf.slice() });
  const doc = await loadingTask.promise;
  container.replaceChildren();
  const rendered = new Set<number>();

  const render = async (n: number, holder: HTMLElement) => {
    if (rendered.has(n)) return;
    rendered.add(n);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const cssWidth = holder.clientWidth || base.width;
    const scale = (cssWidth / base.width) * Math.min(2, window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas: null, canvasContext: canvas.getContext("2d")!, viewport, background: "#ffffff" }).promise;
    holder.replaceChildren(canvas);
    holder.dataset.rendered = "true";
    page.cleanup();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const holder = entry.target as HTMLElement;
        observer.unobserve(holder);
        void render(Number(holder.dataset.page), holder);
      }
    },
    { rootMargin: "800px 0px" },
  );

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const figure = document.createElement("figure");
    figure.className = "udf-page";
    const holder = document.createElement("div");
    holder.className = "udf-page-sheet";
    holder.style.aspectRatio = `${width} / ${height}`;
    holder.dataset.page = String(n);
    holder.setAttribute("role", "img");
    holder.setAttribute("aria-label", pageLabel(n, doc.numPages));
    const caption = document.createElement("figcaption");
    caption.textContent = pageLabel(n, doc.numPages);
    figure.append(holder, caption);
    container.append(figure);
    observer.observe(holder);
  }

  return {
    pageCount: doc.numPages,
    async destroy() {
      observer.disconnect();
      await loadingTask.destroy();
    },
  };
}
