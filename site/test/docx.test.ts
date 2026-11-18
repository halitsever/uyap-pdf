import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import mammoth from "mammoth";
import type { Block, Paragraph, Table, TextRun, UdfDocument } from "../src/udf/model.js";
import { DocxError, readDocx } from "../src/udf/docx-read.js";
import { writeDocx } from "../src/udf/docx-write.js";
import { parseContentXml, readUdf } from "../src/udf/parse.js";
import { writeUdf } from "../src/udf/udf-write.js";
import { LOGO, TURKISH, bodyOnly, para, run, wordDocx } from "./docx-fixtures.js";
import { fieldsFixture, headerFooterFixture, listsFixture, tablesFixture } from "./udf-fixtures.js";

const paragraphs = (blocks: Block[]) => blocks.filter((b): b is Paragraph => b.type === "paragraph");
const tables = (blocks: Block[]) => blocks.filter((b): b is Table => b.type === "table");
const textOfParagraph = (p: Paragraph) => p.inlines.map((i) => (i.type === "text" ? i.text : i.type === "tab" ? "\t" : "[img]")).join("");
const texts = (blocks: Block[]): string[] =>
  blocks.flatMap((b) =>
    b.type === "paragraph" ? [textOfParagraph(b)] : b.type === "table" ? b.rows.flatMap((r) => r.cells.flatMap((c) => texts(c.blocks))) : ["<break>"],
  );
const find = (blocks: Block[], start: string) => paragraphs(blocks).find((p) => textOfParagraph(p).startsWith(start))!;

/** Adjacent runs with one look are one run, however a format splits them. */
function mergedRuns(blocks: Block[]) {
  const out: [string, ...unknown[]][] = [];
  for (const p of paragraphs(blocks)) {
    let prev: string | null = null;
    for (const r of p.inlines) {
      if (r.type !== "text") {
        prev = null;
        continue;
      }
      const look = [r.style.bold, r.style.italic, r.style.underline, r.style.strike, r.style.superscript, r.style.color, r.style.background];
      const key = JSON.stringify(look);
      if (key === prev) out[out.length - 1][0] += r.text;
      else out.push([r.text, ...look]);
      prev = key;
    }
  }
  return out;
}

/** What a round trip through another format must keep. */
function essentials(doc: UdfDocument) {
  return {
    // Empty paragraphs come and go: Word needs one after a nested table, and a covered row span slot is empty.
    texts: texts(doc.body).filter(Boolean),
    runs: mergedRuns(doc.body),
    aligns: paragraphs(doc.body).map((p) => p.align),
    lists: paragraphs(doc.body).map((p) => p.list && [p.list.kind, p.list.level, p.list.label]),
    tables: tables(doc.body).map((t) => t.rows.map((r) => r.cells.map((c) => [c.colspan, texts(c.blocks).filter(Boolean).join("|")]))),
  };
}

test("reads paragraphs, run styles and theme fonts through the style chain", async () => {
  const { doc } = await readDocx(await wordDocx());
  const title = find(doc.body, "T.C. ANKARA");
  assert.equal(title.align, "center");
  assert.equal(title.spaceAbove, 12);
  assert.deepEqual([title.inlines[0].type === "text" && title.inlines[0].style.font, (title.inlines[0] as TextRun).style.size, (title.inlines[0] as TextRun).style.bold], ["Arial", 14, true]);

  const body = find(doc.body, "Davacı");
  assert.equal(body.align, "justify");
  assert.equal(body.firstLineIndent, 35.45);
  assert.equal(body.lineSpacing, 0.5);
  assert.equal(body.spaceBelow, 8);
  const byText = new Map(body.inlines.filter((i): i is TextRun => i.type === "text").map((r) => [r.text.trim(), r.style]));
  assert.equal(byText.get("Davacı")!.font, "Calibri");
  assert.equal(byText.get("Davacı")!.size, 11);
  assert.ok(byText.get("vekili")!.italic);
  assert.ok(byText.get("beyan")!.underline);
  assert.ok(byText.get("önemli")!.bold);
  assert.equal(byText.get("önemli")!.color, "#c00000");
  assert.equal(byText.get("sarı")!.background, "#ffff00");
  assert.ok(byText.get("2")!.superscript);
  assert.ok(byText.get("çizili")!.strike);
  assert.equal(byText.get(TURKISH)!.font, "Times New Roman");
  // Tracked insertions are kept, deletions and hidden text are not, and caps use Turkish casing.
  const line = textOfParagraph(body);
  assert.match(line, /ederiz eklenen önemli/);
  assert.doesNotMatch(line, /SİLİNEN|GİZLİ/);
  assert.match(line, / İSTANBUL /);
});

test("hanging indents get Word's implicit tab stop and right tabs keep their leader", async () => {
  const { doc } = await readDocx(await wordDocx());
  const davaci = find(doc.body, "DAVACI");
  assert.equal(davaci.leftIndent, 113.4);
  assert.equal(davaci.firstLineIndent, -113.4);
  assert.deepEqual(davaci.tabStops![0], { position: 113.4, align: "left", leader: "none" });
  assert.equal(davaci.tabStops!.filter((t) => t.position === 113.4).length, 1);
  const total = find(doc.body, "Toplam");
  assert.deepEqual(total.tabStops![0], { position: 453.6, align: "right", leader: "dots" });
});

test("numbering continues across items, nests, restarts on startOverride and maps bullets", async () => {
  const { doc } = await readDocx(await wordDocx());
  const items = paragraphs(doc.body).filter((p) => p.list);
  assert.deepEqual(
    items.map((p) => [textOfParagraph(p), p.list!.kind, p.list!.format, p.list!.level, p.list!.label]),
    [
      ["Birinci madde", "number", "NUMBER_TYPE_NUMBER_DOT", 0, "1."],
      ["İkinci madde", "number", "NUMBER_TYPE_NUMBER_DOT", 0, "2."],
      ["Alt madde", "number", "NUMBER_TYPE_CHAR_SMALL_PARANTHESE", 1, "a)"],
      ["Üçüncü madde", "number", "NUMBER_TYPE_NUMBER_DOT", 0, "3."],
      ["Madde işaretli", "bullet", "BULLET_TYPE_ELLIPSE", 0, "•"],
      ["Yeniden bir", "number", "NUMBER_TYPE_NUMBER_DOT", 0, "1."],
    ],
  );
  assert.equal(items[0].leftIndent, 36);
  assert.equal(items[2].leftIndent, 72);
  // contextualSpacing drops the space between list paragraphs of one style.
  assert.equal(items[0].spaceBelow, 0);
  assert.equal(items[5].spaceBelow, 8);
});

test("tables keep grid widths, column and row spans, fills and borders from the table style", async () => {
  const { doc } = await readDocx(await wordDocx());
  const [t] = tables(doc.body);
  assert.deepEqual(t.columnWidths, [100, 150, 200]);
  assert.equal(t.rows[0].minHeight, 20);
  assert.deepEqual(
    t.rows.map((r) => r.cells.map((c) => [c.colspan, c.rowspan, texts(c.blocks).join("")])),
    [
      [
        [2, 1, "Birleşik sütun"],
        [1, 1, "C1"],
      ],
      [
        [1, 2, "Dikey"],
        [1, 1, "B2"],
        [1, 1, "C2"],
      ],
      [
        [1, 1, "B3"],
        [1, 1, "C3"],
      ],
    ],
  );
  assert.equal(t.rows[0].cells[0].fill, "#d9d9d9");
  assert.equal(t.rows[1].cells[0].verticalAlign, "middle");
  assert.deepEqual(t.rows[0].cells[1].borders.top, { width: 0.5, color: "#000000", style: "solid" });
  assert.deepEqual(t.rows[2].cells[1].borders.bottom, { width: 1.5, color: "#ff0000", style: "double" });
});

test("breaks, images, footnotes, text boxes, header, footer and page setup", async () => {
  const { doc, notes } = await readDocx(await wordDocx());
  const all = texts(doc.body);
  assert.deepEqual(all.slice(all.indexOf("Satır bir"), all.indexOf("Satır bir") + 5), ["Satır bir", "satır iki", "Sayfa sonu öncesi", "<break>", "Sayfa sonu sonrası"]);
  assert.equal(find(doc.body, "Satır bir").spaceBelow, 0);
  const logo = find(doc.body, "[img]");
  const img = logo.inlines[0];
  assert.ok(img.type === "image" && img.image.base64 === LOGO && img.width === 72 && img.height === 36);
  assert.equal(textOfParagraph(find(doc.body, "Dipnotlu")), "Dipnotlu cümle1.");
  assert.equal(textOfParagraph(paragraphs(doc.body).at(-1)!), "1 Yargıtay 9. HD kararı.");
  assert.ok(all.indexOf("Kutu içindeki metin") > all.indexOf("Kutudan sonra"));
  assert.equal(all[all.indexOf("Yeni sayfada başlayan paragraf") - 1], "<break>");
  assert.deepEqual(notes.sort(), ["footnotes", "textbox"]);

  assert.deepEqual(texts(doc.header!.blocks), ["T.C. İSTANBUL ADLİYESİ"]);
  assert.equal(paragraphs(doc.header!.blocks)[0].align, "right");
  assert.deepEqual(texts(doc.footer!.blocks), ["Gizli belge"]);
  const pn = doc.footer!.pageNumber!;
  assert.deepEqual([pn.prefix, pn.separator, pn.suffix, pn.withTotal, pn.align, pn.top], ["Sayfa ", " / ", "", true, "center", false]);

  assert.equal(doc.page.landscape, true);
  assert.equal(doc.page.mediaSizeName, "1");
  assert.deepEqual([doc.page.marginTop, doc.page.marginLeft, doc.page.marginRight, doc.page.headerOffset], [56.7, 85.05, 42.5, 35.4]);
});

test("Word to UDF round trip through our parser keeps text, order, styles, lists and tables", async () => {
  const { doc } = await readDocx(await wordDocx());
  const back = await readUdf(await writeUdf(doc));
  const a = essentials(doc);
  const b = essentials(back);
  assert.deepEqual(b.texts, a.texts);
  assert.deepEqual(b.runs, a.runs);
  assert.deepEqual(b.aligns, a.aligns);
  assert.deepEqual(b.lists, a.lists);
  // Row spans do not exist in the editor, so the covered slot comes back as an empty cell.
  assert.deepEqual(b.tables, [
    [
      [
        [2, "Birleşik sütun"],
        [1, "C1"],
      ],
      [
        [1, "Dikey"],
        [1, "B2"],
        [1, "C2"],
      ],
      [
        [1, ""],
        [1, "B3"],
        [1, "C3"],
      ],
    ],
  ]);
  assert.deepEqual(find(back.body, "DAVACI").tabStops![0], { position: 113.4, align: "left", leader: "none" });
  assert.equal(find(back.body, "DAVACI").firstLineIndent, -113.4);
  assert.deepEqual(back.footer!.pageNumber!.prefix, "Sayfa ");
  assert.deepEqual(texts(back.header!.blocks), ["T.C. İSTANBUL ADLİYESİ"]);
  assert.deepEqual(back.page, doc.page);
});

test("UDF to Word writes a docx that mammoth and our reader both read back", async () => {
  for (const fixture of [fieldsFixture(), tablesFixture(), listsFixture(), headerFooterFixture()]) {
    const udf = parseContentXml(fixture);
    const docx = await writeDocx(udf);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(docx) });
    let at = -1;
    for (const t of texts(udf.body).filter((x) => x.trim() && x !== "<break>")) {
      const first = t.split("\t")[0].trim();
      const next = value.indexOf(first, at + 1);
      assert.ok(next > at, `"${first}" missing or out of order in mammoth's text`);
      at = next;
    }
    const { doc } = await readDocx(docx);
    const a = essentials(udf);
    const b = essentials(doc);
    assert.deepEqual(b.texts.filter((t) => t !== "<break>"), a.texts.filter((t) => t !== "<break>"));
    assert.deepEqual(b.runs, a.runs);
    assert.deepEqual(b.lists, a.lists);
    assert.deepEqual(b.tables, a.tables);
  }
});

test("UDF to Word carries page setup, header, footer, page numbers and table spans as Word markup", async () => {
  const docx = await writeDocx(parseContentXml(headerFooterFixture()));
  const zip = await JSZip.loadAsync(docx);
  const document = await zip.file("word/document.xml")!.async("string");
  assert.match(document, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
  assert.match(document, /<w:headerReference w:type="default"/);
  const footers = await Promise.all(Object.keys(zip.files).filter((n) => /word\/footer\d*\.xml/.test(n)).map((n) => zip.file(n)!.async("string")));
  assert.ok(footers.some((f) => /PAGE/.test(f) && /NUMPAGES/.test(f) && f.includes("Sayfa ")));
  const media = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
  assert.equal(media.length, 2, "header logo and letterhead");

  const tableXml = await (await JSZip.loadAsync(await writeDocx(parseContentXml(tablesFixture())))).file("word/document.xml")!.async("string");
  assert.match(tableXml, /<w:gridSpan w:val="2"\/>/);
  assert.match(tableXml, /<w:vMerge w:val="restart"\/>/);
  assert.match(tableXml, /<w:vMerge w:val="continue"\/>|<w:vMerge\/>/);
  assert.match(tableXml, /w:fill="EEEEEE"/i);

  const listXml = await (await JSZip.loadAsync(await writeDocx(parseContentXml(listsFixture())))).file("word/document.xml")!.async("string");
  assert.match(listXml, /<w:numPr>/);
  assert.match(listXml, /<w:vertAlign w:val="subscript"\/>/);
  assert.match(listXml, /<w:tab w:val="left" w:pos="2260"\/>/);
});

test("Word round trip: model to docx to model keeps the essentials", async () => {
  const { doc } = await readDocx(await wordDocx());
  const { doc: again } = await readDocx(await writeDocx(doc));
  const a = essentials(doc);
  const b = essentials(again);
  assert.deepEqual(b.texts, a.texts);
  assert.deepEqual(b.runs, a.runs);
  assert.deepEqual(b.lists, a.lists);
  assert.deepEqual(b.tables, a.tables);
  assert.deepEqual(again.footer!.pageNumber!.prefix, "Sayfa ");
});

test("rejects .doc, RTF, encrypted and non-Word files with a code the page can explain", async () => {
  const ole = new Uint8Array(4096);
  ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(readDocx(ole), (e: DocxError) => e.code === "doc-binary");
  const encrypted = ole.slice();
  encrypted.set(new Uint8Array(Buffer.from("EncryptionInfo", "utf16le")), 1024);
  await assert.rejects(readDocx(encrypted), (e: DocxError) => e.code === "encrypted");
  await assert.rejects(readDocx(new TextEncoder().encode("{\\rtf1\\ansi hello}")), (e: DocxError) => e.code === "rtf");
  await assert.rejects(readDocx(new TextEncoder().encode("not a zip")), (e: DocxError) => e.code === "not-zip");
  const zip = new JSZip();
  zip.file("content.xml", "<template/>");
  await assert.rejects(readDocx(await zip.generateAsync({ type: "uint8array" })), (e: DocxError) => e.code === "not-docx");
});

test("an empty document still gives the editor one paragraph", async () => {
  const { doc } = await readDocx(await wordDocx(bodyOnly()));
  assert.equal(doc.body.length, 1);
  const back = await readUdf(await writeUdf(doc));
  assert.equal(back.body.length, 1);
  const { doc: one } = await readDocx(await wordDocx(bodyOnly(para("", run("tek satır")))));
  assert.deepEqual(texts(one.body), ["tek satır"]);
  assert.equal(one.header, null);
});
