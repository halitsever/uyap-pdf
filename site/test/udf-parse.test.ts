import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToUdf } from "udf-cli";
import type { Block, Paragraph, Table, TextRun } from "../src/udf/model.js";
import { numberLabel, parseContentXml, readUdf } from "../src/udf/parse.js";
import { parseXml, textOf, type XmlElement } from "../src/udf/xml.js";
import { pagesToUdf } from "../src/udf-build.js";
import { TURKISH, fieldsFixture, headerFooterFixture, listsFixture, solidPng, tablesFixture, zipUdf } from "./udf-fixtures.js";

const paragraphs = (blocks: Block[]) => blocks.filter((b): b is Paragraph => b.type === "paragraph");
const tables = (blocks: Block[]) => blocks.filter((b): b is Table => b.type === "table");
const textOfParagraph = (p: Paragraph) => p.inlines.map((i) => (i.type === "text" ? i.text : i.type === "tab" ? "\t" : "[img]")).join("");

test("parseXml decodes entities, keeps CDATA verbatim and normalises line ends", () => {
  const root = parseXml('<?xml version="1.0"?><a x="1 &amp; 2" y=\'&#305;\'><b/><c><![CDATA[<raw>\r\nline]]></c></a>');
  const a = root.children[0] as XmlElement;
  assert.equal(a.attrs.x, "1 & 2");
  assert.equal(a.attrs.y, "ı");
  assert.equal((a.children[0] as XmlElement).name, "b");
  assert.equal(textOf(a.children[1] as XmlElement), "<raw>\nline");
});

test("field elements keep their text in document order and tabs become tab runs", () => {
  const doc = parseContentXml(fieldsFixture());
  const texts = paragraphs(doc.body).map(textOfParagraph);
  assert.equal(texts[0], "ANKARA 3. İŞ MAHKEMESİ");
  assert.equal(texts[1], "DOSYA NO\t:\t2026/481 Esas");
  assert.equal(texts[2], `DAVACI\t:\tAyşe Gül Çınar (${TURKISH})`);
  assert.equal(texts[3], "Önce BİRİNCİ sonra İKİNCİ en son ÜÇÜNCÜ.");
  const fields = paragraphs(doc.body)
    .flatMap((p) => p.inlines)
    .filter((i): i is TextRun => i.type === "text" && !!i.field)
    .map((i) => i.field);
  assert.deepEqual(fields, ["mahkeme", "esasNo", "davaci", "alanBir", "alanIki"]);
  assert.equal(doc.formatId, "1.7");
});

test("named styles resolve through their resolver chain", () => {
  const doc = parseContentXml(fieldsFixture());
  const title = paragraphs(doc.body)[0].inlines[0] as TextRun;
  assert.deepEqual([title.style.font, title.style.size, title.style.bold], ["Arial", 14, true]);
  const label = paragraphs(doc.body)[1].inlines[0] as TextRun;
  assert.deepEqual([label.style.font, label.style.size, label.style.bold], ["Times New Roman", 12, true]);
});

test("tab stops, unknown paper sizes and the empty-paragraph placeholder", () => {
  const doc = parseContentXml(fieldsFixture());
  const p = paragraphs(doc.body)[1];
  assert.deepEqual(
    p.tabStops?.map((s) => s.position),
    [14.17, 28.35, 85.04, 141.73, 212.6],
  );
  const total = paragraphs(doc.body)[4];
  assert.deepEqual(total.tabStops?.[0], { position: 300, align: "right", leader: "dots" });
  assert.equal(paragraphs(doc.body)[5].inlines.length, 0);
  // mediaSizeName 8 is not a size the editor documents, so it falls back to A4.
  assert.deepEqual([doc.page.width, doc.page.height, doc.page.landscape], [595.28, 841.89, false]);
});

test("tables keep spans, borders, fills and nested tables", () => {
  const doc = parseContentXml(tablesFixture());
  const [main, proportional] = tables(doc.body);
  assert.deepEqual(main.columnWidths, [120, 180, 200]);
  const [r1, r2, r3] = main.rows;
  assert.deepEqual([r1.cells[0].rowspan, r1.cells[0].verticalAlign, r1.cells[0].fill], [2, "middle", "#eeeeee"]);
  assert.equal(r1.cells[1].colspan, 2);
  assert.equal(r2.cells.length, 2);
  assert.equal(r2.cells[1].borders.top?.style, "dashed");
  assert.ok(r3.cells[0].borders.top && r3.cells[0].borders.bottom);
  assert.equal(r3.cells[0].borders.left, null);
  assert.equal(tables(r3.cells[1].blocks).length, 1);
  assert.deepEqual(Object.values(r3.cells[2].borders), [null, null, null, null]);
  assert.deepEqual(proportional.columnWidths, [1, 1]);
});

test("header, footer page numbers, landscape and letterhead background", () => {
  const doc = parseContentXml(headerFooterFixture());
  assert.equal(doc.page.landscape, true);
  assert.ok(doc.page.width > doc.page.height);
  const header = paragraphs(doc.header!.blocks)[0];
  assert.equal(header.inlines[0].type, "image");
  assert.match(textOfParagraph(header), /T\.C\. İSTANBUL ANADOLU ADLİYESİ/);
  assert.deepEqual(doc.footer!.pageNumber && { ...doc.footer!.pageNumber, style: undefined }, {
    top: false,
    align: "center",
    withTotal: true,
    skipFirst: false,
    skipSingle: false,
    prefix: "Sayfa ",
    suffix: "",
    separator: "/",
    startNumber: 1,
    style: undefined,
  });
  assert.equal(doc.footer!.pageNumber!.style.size, 9);
  assert.equal(doc.background?.marginRight, 10);
  assert.equal(doc.background?.image.mime, "image/png");
  assert.equal(doc.body.filter((b) => b.type === "pageBreak").length, 1);
  // The break's own empty paragraph is not content.
  assert.equal(paragraphs(doc.body).length, 30);
});

test("lists are numbered per list id and run styles are resolved", () => {
  const doc = parseContentXml(listsFixture());
  const ps = paragraphs(doc.body);
  assert.deepEqual(
    ps.filter((p) => p.list).map((p) => p.list!.label),
    ["1.", "2.", "•", "I)"],
  );
  const styled = ps[5].inlines as TextRun[];
  assert.equal(styled[0].style.bold, true);
  assert.equal(styled[3].style.strike, true);
  assert.equal(styled[4].style.color, "#ff0000");
  assert.equal(styled[5].style.background, "#ffff00");
  assert.equal(styled[7].style.subscript, true);
  assert.equal(styled[9].style.superscript, true);
  const hanging = ps[6];
  assert.deepEqual([hanging.leftIndent, hanging.firstLineIndent], [113, -113]);
});

test("unknown elements keep their text", () => {
  const doc = parseContentXml(listsFixture());
  assert.deepEqual(doc.unknownElements.sort(), ["barcode", "mystery-block"]);
  const texts = paragraphs(doc.body).map(textOfParagraph);
  assert.ok(texts.includes("Bilinmeyen öğe içindeki metin korunur."));
  assert.ok(texts.includes("BARKOD-1234"));
});

test("a document without elements falls back to its text pool", () => {
  const doc = parseContentXml('<template format_id="1.8"><content><![CDATA[Birinci satır\nİkinci satır\n]]></content></template>');
  assert.deepEqual(paragraphs(doc.body).map(textOfParagraph), ["Birinci satır", "İkinci satır"]);
});

test("readUdf reports signatures and extra files, and rejects non-UDF input", async () => {
  const signed = await readUdf(await zipUdf(fieldsFixture(), { "sign.sgn": "imza", "comments.xml": "<comments/>" }));
  assert.equal(signed.signed, true);
  assert.deepEqual(signed.extraFiles.sort(), ["comments.xml", "sign.sgn"]);
  await assert.rejects(readUdf(new TextEncoder().encode("%PDF-1.7 not a zip")), { code: "not-zip" });
  await assert.rejects(readUdf(await zipUdf("")), { code: "bad-xml" });
});

test("reads this site's own PDF to UDF output", async () => {
  const png = `data:image/png;base64,${solidPng(10, 14, [200, 200, 200])}`;
  const udf = await pagesToUdf([
    { dataUri: png, widthPx: 1654, heightPx: 2339 },
    { dataUri: png, widthPx: 1654, heightPx: 2339 },
  ]);
  const doc = await readUdf(udf);
  const images = paragraphs(doc.body).flatMap((p) => p.inlines.filter((i) => i.type === "image"));
  assert.equal(images.length, 2);
  assert.equal(doc.body.filter((b) => b.type === "pageBreak").length, 1);
  assert.equal(doc.page.marginTop, 0);
});

test("reads udf-cli htmlToUdf output in order", async () => {
  const udf = await htmlToUdf(`<p style="text-align:center"><strong>T.C. ANKARA ${TURKISH}</strong></p><p>Davacı <em>vekili</em> olarak <u>beyan</u> ederiz.</p>`);
  const doc = await readUdf(new Uint8Array(udf));
  const texts = paragraphs(doc.body).map(textOfParagraph);
  assert.equal(texts[0], `T.C. ANKARA ${TURKISH}`);
  assert.equal(texts[1], "Davacı vekili olarak beyan ederiz.");
  assert.equal(paragraphs(doc.body)[0].align, "center");
});

test("numberLabel covers the editor's numbering formats", () => {
  assert.equal(numberLabel("NUMBER_TYPE_NUMBER_PARENTHESIS", 3), "3)");
  assert.equal(numberLabel("NUMBER_TYPE_CHAR_SMALL_DOT", 28), "ab.");
  assert.equal(numberLabel("NUMBER_TYPE_ROMAN_SMALL_DOT", 14), "xiv.");
  assert.equal(numberLabel("NUMBER_TYPE_CHAR_BIG_PARENTHESIS", 2), "B)");
});
