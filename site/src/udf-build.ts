import "./buffer-shim.js";
import JSZip from "jszip";
import { htmlToUdf } from "udf-cli";

export const RASTERIZE_DPI = 200;

export interface PageImage {
  dataUri: string;
  widthPx: number;
  heightPx: number;
}

/** Converts pixels at the given DPI to points (1/72 inch), the unit UDF `width`/`height` expects. */
export function pxToPt(px: number, dpi: number): number {
  return (px / dpi) * 72;
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildPagesHtml(pages: PageImage[], dpi: number = RASTERIZE_DPI): string {
  const body = pages
    .map(
      (p) =>
        `<p><img src="${escapeHtmlAttr(p.dataUri)}" width="${pxToPt(p.widthPx, dpi)}" height="${pxToPt(p.heightPx, dpi)}"/></p>`,
    )
    .join("<page-break/>");
  return `<html><body>${body}</body></html>`;
}

/**
 * `htmlToUdf` always emits a fixed default page margin with no option to
 * change it. Zeroing the margins lets the page images cover the page edge to edge.
 */
export async function zeroUdfPageMargins(udf: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(udf);
  const contentFile = zip.file("content.xml");
  if (!contentFile) return udf;

  const content = (await contentFile.async("string")).replace(/<pageFormat\b[^>]*\/>/i, (tag) =>
    tag.replace(/(left|right|top|bottom)Margin="[^"]*"/gi, '$1Margin="0.00"'),
  );

  zip.file("content.xml", content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Packs rasterized page images into a UYAP UDF document. */
export async function pagesToUdf(pages: PageImage[], dpi: number = RASTERIZE_DPI): Promise<Uint8Array> {
  const html = buildPagesHtml(pages, dpi);
  const rawUdf = await htmlToUdf(html);
  return zeroUdfPageMargins(new Uint8Array(rawUdf));
}
