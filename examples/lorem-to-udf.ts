import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { convertPdfBufferToUdf } from "../src/docx-to-udf.js";

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor " +
  "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud " +
  "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute " +
  "irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla " +
  "pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia " +
  "deserunt mollit anim id est laborum.";

/** Naive word wrap sized for 11pt Helvetica inside A4 margins. */
function wrapText(text: string, maxChars = 88): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line.length + word.length + 1 > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Builds a minimal multi-page A4 PDF, lorem ipsum body with a page header. */
function buildLoremPdf(pageCount: number): Buffer {
  const paragraphLines = wrapText(LOREM);
  const objects: string[] = [];
  const pageRefs: number[] = [];

  // obj 1: catalog, obj 2: page tree, obj 3: font, pages start at obj 4
  for (let p = 0; p < pageCount; p++) {
    const pageObj = 4 + p * 2;
    const contentObj = pageObj + 1;
    pageRefs.push(pageObj);

    const parts: string[] = [`BT /F1 16 Tf 72 780 Td (Page ${p + 1} of ${pageCount}) Tj ET`];
    let y = 740;
    for (let block = 0; block < 4 && y > 60; block++) {
      for (const line of paragraphLines) {
        parts.push(`BT /F1 11 Tf 72 ${y} Td (${line}) Tj ET`);
        y -= 16;
      }
      y -= 12;
    }
    const stream = parts.join("\n");

    objects[pageObj] =
      `${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj`;
    objects[contentObj] =
      `${contentObj} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`;
  }

  objects[1] = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj";
  objects[2] =
    `2 0 obj << /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] ` +
    `/Count ${pageCount} >> endobj`;
  objects[3] = "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj";

  return Buffer.from(`%PDF-1.4\n${objects.filter(Boolean).join("\n")}\ntrailer << /Root 1 0 R >>\n%%EOF`);
}

const outDir = new URL(".", import.meta.url).pathname;
const pdf = buildLoremPdf(8);
await writeFile(join(outDir, "lorem.pdf"), pdf);
console.log(`lorem.pdf: 8 pages, ${(pdf.length / 1024).toFixed(1)} KB`);

const outcome = await convertPdfBufferToUdf(pdf);
if (!outcome.ok) {
  console.error(outcome.error);
  process.exit(1);
}
await writeFile(join(outDir, "lorem.udf"), outcome.udf);
console.log(`lorem.udf: ${(outcome.udf.length / 1024 / 1024).toFixed(2)} MB`);
