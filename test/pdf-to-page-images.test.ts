import assert from "node:assert/strict";
import { describe, test } from "node:test";
import PizZip from "pizzip";
import sharp from "sharp";
import { convertPdfBufferToUdf } from "../src/pdf-to-udf.js";
import { rasterizePdfPagesToPng } from "../src/pdf-to-page-images.js";

/** Minimal two-page A4 PDF with one line of text per page. */
const TWO_PAGE_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 24 Tf 72 720 Td (Page one) Tj ET
endstream endobj
5 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >> endobj
6 0 obj << /Length 44 >> stream
BT /F1 24 Tf 72 720 Td (Page two) Tj ET
endstream endobj
7 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`,
);

describe("rasterizePdfPagesToPng", () => {
  test("renders each page as a PNG at the requested DPI", async () => {
    const pngs = await rasterizePdfPagesToPng(TWO_PAGE_PDF, 200);
    assert.equal(pngs.length, 2);
    for (const png of pngs) {
      const meta = await sharp(png).metadata();
      assert.equal(meta.format, "png");
      // A4 (595x842pt) at 200 DPI is ~1653x2339px; PDFium may round by a pixel.
      assert.ok(Math.abs((meta.width ?? 0) - 1653) <= 2, `width ${meta.width}`);
      assert.ok(Math.abs((meta.height ?? 0) - 2339) <= 2, `height ${meta.height}`);
    }
  });

  test("renders white pages with dark text, not blank or inverted", async () => {
    const [png] = await rasterizePdfPagesToPng(TWO_PAGE_PDF, 100);
    const stats = await sharp(png).stats();
    for (const channel of stats.channels) {
      assert.ok(channel.mean > 240, `page not mostly white: mean ${channel.mean}`);
      assert.ok(channel.min < 100, `no dark text pixels: min ${channel.min}`);
    }
  });

  test("rejects garbage input", async () => {
    await assert.rejects(() => rasterizePdfPagesToPng(Buffer.from("not a pdf")));
  });
});

describe("convertPdfBufferToUdf", () => {
  test("produces a UDF with embedded page images and zero margins", async () => {
    const outcome = await convertPdfBufferToUdf(TWO_PAGE_PDF);
    assert.ok(outcome.ok, outcome.ok ? undefined : outcome.error);

    const zip = new PizZip(outcome.udf);
    const content = zip.file("content.xml")?.asText() ?? "";
    assert.ok(content.includes('leftMargin="0.00"'));
    const imageEntries = Object.keys(zip.files).filter((f) => /^resources\/|image/i.test(f));
    assert.ok(imageEntries.length > 0 || /image/i.test(content), "no embedded images found");
  });
});
