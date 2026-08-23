import PizZip from "pizzip";
import sharp from "sharp";
import { htmlToUdf } from "udf-cli";
import { convertDocxBufferToPdf } from "./docx-to-pdf.js";
import { bufferLooksLikeDocxZip } from "./libreoffice-convert.js";
import { rasterizePdfPagesToPng } from "./pdf-to-page-images.js";

const RASTERIZE_DPI = 200;

/** Converts pixels at the given DPI to points (1/72 inch), the unit UDF `width`/`height` expects. */
export function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * 72;
}

/**
 * `htmlToUdf` from `udf-cli` always emits a fixed default page margin
 * (`DEFAULT_PAGE_FORMAT`, ~1-1.5cm for A4) with no option to change it.
 * Zeroing the margins in the single `pageFormat` element of the generated
 * `content.xml` lets the page images cover the PDF page edge to edge.
 * `mediaSizeName`, `paperOrientation`, `headerFOffset` and `footerFOffset` stay untouched.
 */
export function zeroUdfPageMargins(udf: Buffer): Buffer {
  const zip = new PizZip(udf);
  const contentFile = zip.file("content.xml");
  if (!contentFile) return udf;

  const content = contentFile.asText().replace(/<pageFormat\b[^>]*\/>/i, (tag) =>
    tag.replace(/(left|right|top|bottom)Margin="[^"]*"/gi, '$1Margin="0.00"'),
  );

  zip.file("content.xml", content);
  return Buffer.from(zip.generate({ type: "uint8array", compression: "DEFLATE" }));
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function buildPagesHtml(pagePngs: Buffer[]): Promise<string> {
  const pages = await Promise.all(
    pagePngs.map(async (png) => {
      const { width, height } = await sharp(png).metadata();
      const widthPt = pxToPt(width ?? 0, RASTERIZE_DPI);
      const heightPt = pxToPt(height ?? 0, RASTERIZE_DPI);
      const dataUri = `data:image/png;base64,${png.toString("base64")}`;
      return `<p><img src="${escapeHtmlAttr(dataUri)}" width="${widthPt}" height="${heightPt}"/></p>`;
    }),
  );
  return `<html><body>${pages.join("<page-break/>")}</body></html>`;
}

/**
 * Rasterizes each PDF page to a high resolution image and embeds them into
 * a UYAP UDF. The UDF mirrors the PDF pages exactly, so LibreOffice HTML
 * export bugs (line spacing, table widths, header/footer loss) cannot affect it.
 *
 * Callers that already produced the PDF (e.g. a request shipping both PDF and
 * UDF attachments) can call this directly and skip a second DOCX to PDF run
 * through the LibreOffice subprocess.
 */
export async function convertPdfBufferToUdf(
  pdf: Buffer,
): Promise<{ ok: true; udf: Buffer } | { ok: false; error: string }> {
  try {
    const pagePngs = await rasterizePdfPagesToPng(pdf, RASTERIZE_DPI);
    const html = await buildPagesHtml(pagePngs);
    const rawUdf = await htmlToUdf(html);
    const udf = zeroUdfPageMargins(Buffer.from(rawUdf));
    return { ok: true, udf };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[convertPdfBufferToUdf]", e);
    return { ok: false, error: `UDF oluşturulamadı: ${msg.slice(0, 800)}` };
  }
}

/** Converts DOCX to PDF via LibreOffice, then embeds it with {@link convertPdfBufferToUdf}. */
export async function convertDocxBufferToUdf(
  docx: Buffer,
): Promise<{ ok: true; udf: Buffer } | { ok: false; error: string }> {
  if (!bufferLooksLikeDocxZip(docx)) {
    return {
      ok: false,
      error:
        "UDF oluşturulamadı: Geçerli bir DOCX verilmiyor (dosya boş veya ZIP tabanlı Office belgesi değil).",
    };
  }

  const pdfOutcome = await convertDocxBufferToPdf(docx);
  if (!pdfOutcome.ok) {
    return { ok: false, error: pdfOutcome.error };
  }

  return convertPdfBufferToUdf(pdfOutcome.pdf);
}
