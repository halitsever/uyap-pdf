import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import pdfmake from "pdfmake";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseContentXml, readUdf } from "../src/udf/parse.js";
import { renderPdf, type PdfMake } from "../src/udf/render-pdf.js";
import { pagesToUdf } from "../src/udf-build.js";
import { TURKISH, fieldsFixture, headerFooterFixture, listsFixture, solidPng, tablesFixture } from "./udf-fixtures.js";

const loadFont = async (file: string) => readFileSync(new URL(`../src/udf/fonts/${file}.woff`, import.meta.url));

interface Item {
  str: string;
  x: number;
  y: number;
}

async function render(xmlOrDoc: Parameters<typeof renderPdf>[1]) {
  const bytes = await renderPdf(pdfmake as PdfMake, xmlOrDoc, loadFont);
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const pages: { width: number; height: number; items: Item[]; text: string }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { width, height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] }));
    pages.push({ width, height, items, text: items.map((i) => i.str).join("") });
  }
  await task.destroy();
  return { bytes, pages };
}

test("PDF text keeps Turkish characters and field order", async () => {
  const { bytes, pages } = await render(parseContentXml(fieldsFixture()));
  const text = pages[0].text;
  assert.ok(text.includes(TURKISH), "Turkish characters survive");
  const order = ["ANKARA 3. İŞ MAHKEMESİ", "2026/481 Esas", "Ayşe Gül Çınar", "BİRİNCİ", "İKİNCİ", "ÜÇÜNCÜ", "SONUÇ"];
  const positions = order.map((s) => text.indexOf(s));
  assert.ok(
    positions.every((p) => p >= 0),
    `all present: ${positions}`,
  );
  assert.deepEqual(
    [...positions].sort((a, b) => a - b),
    positions,
  );
  // Fonts are embedded, so the text renders the same everywhere.
  assert.ok(Buffer.from(bytes).includes("Tinos-Bold"));
  assert.ok(Buffer.from(bytes).includes("Arimo"));
});

test("values after the same tab stop line up", async () => {
  const { pages } = await render(parseContentXml(fieldsFixture()));
  const x = (s: string) => pages[0].items.find((i) => i.str.startsWith(s))!.x;
  assert.ok(Math.abs(x("2026/481") - x("Ayşe")) < 0.5, `${x("2026/481")} vs ${x("Ayşe")}`);
  // The colon sits on the 85.04pt stop, so the value goes to the next one, 141.73pt past the 8.5pt margin.
  assert.ok(Math.abs(x(":") - (8.5 + 85.04)) < 0.5, String(x(":")));
  assert.ok(Math.abs(x("2026/481") - (8.5 + 141.73)) < 0.5, String(x("2026/481")));
});

test("landscape pages carry the header, footer and page numbers", async () => {
  const { pages } = await render(parseContentXml(headerFooterFixture()));
  assert.ok(pages.length >= 2);
  for (const [i, page] of pages.entries()) {
    assert.ok(page.width > page.height, "landscape");
    assert.ok(page.text.includes("T.C. İSTANBUL ANADOLU ADLİYESİ"), `header on page ${i + 1}`);
    assert.ok(page.text.includes(`Sayfa ${i + 1}/${pages.length}`), `page number on page ${i + 1}`);
  }
  // The page break after item 3 starts page 2 with item 4.
  assert.ok(pages[0].text.includes("3. Davacı") && !pages[0].text.includes("4. Davacı"));
  assert.ok(pages[1].text.includes("4. Davacı"));
  const header = pages[0].items.find((i) => i.str.includes("ADLİYESİ"))!;
  const firstLine = pages[0].items.find((i) => i.str.startsWith("1. Davacı"))!;
  assert.ok(header.y > firstLine.y, "body starts below the header");
});

test("tables and lists render their text", async () => {
  const tables = await render(parseContentXml(tablesFixture()));
  for (const s of ["Birleşik satır", "Birleşik sütun ğüşıöç", "Hücre C2", "iç A", "Kenarsız", "Oransal sağ"]) {
    assert.ok(tables.pages[0].text.includes(s), s);
  }
  const lists = await render(parseContentXml(listsFixture()));
  for (const s of ["1.", "Birinci madde.", "I)", "Courier satırı", "BARKOD-1234"]) assert.ok(lists.pages[0].text.includes(s), s);
});

test("this site's PDF to UDF output turns back into one PDF page per image", async () => {
  const png = `data:image/png;base64,${solidPng(12, 17, [30, 60, 90])}`;
  const page = { dataUri: png, widthPx: 1654, heightPx: 2339 };
  const doc = await readUdf(await pagesToUdf([page, page, page]));
  const { pages } = await render(doc);
  assert.equal(pages.length, 3);
});
