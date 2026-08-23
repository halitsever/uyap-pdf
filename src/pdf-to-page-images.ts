import { PDFiumLibrary } from "@hyzyla/pdfium";
import sharp from "sharp";

type Library = Awaited<ReturnType<typeof PDFiumLibrary.init>>;

let libraryPromise: Promise<Library> | null = null;

/** WASM init has a noticeable cost, so one library instance is shared per process. */
function getPdfiumLibrary(): Promise<Library> {
  libraryPromise ??= PDFiumLibrary.init();
  return libraryPromise;
}

/**
 * Rasterizes each PDF page to PNG at the given resolution with PDFium (WASM)
 * and returns the buffers in page order. Pure WASM, so it runs on macOS,
 * Windows and Linux without external binaries.
 */
export async function rasterizePdfPagesToPng(pdf: Buffer, dpi = 200): Promise<Buffer[]> {
  const library = await getPdfiumLibrary();

  let document;
  try {
    document = await library.loadDocument(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not rasterize PDF pages: the PDF failed to open (it may be corrupted or password-protected). Details: ${msg.slice(0, 800)}`,
    );
  }

  try {
    const pngs: Buffer[] = [];
    for (const page of document.pages()) {
      // The bitmap render is requested with REVERSE_BYTE_ORDER, so data arrives as RGBA.
      const { data, width, height } = await page.render({ scale: dpi / 72, render: "bitmap" });
      const png = await sharp(data, { raw: { width, height, channels: 4 } })
        .removeAlpha()
        .png()
        .toBuffer();
      pngs.push(png);
    }

    if (pngs.length === 0) {
      throw new Error("Could not rasterize PDF pages: the document has no pages.");
    }

    return pngs;
  } finally {
    document.destroy();
  }
}
