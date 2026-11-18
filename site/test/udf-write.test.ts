import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import type { Block, Paragraph, Table, UdfDocument } from "../src/udf/model.js";
import { parseContentXml, readUdf } from "../src/udf/parse.js";
import { writeContentXml, writeUdf } from "../src/udf/udf-write.js";
import { childElements, firstChild, parseXml, textOf, type XmlElement } from "../src/udf/xml.js";
import { fieldsFixture, headerFooterFixture, listsFixture, tablesFixture } from "./udf-fixtures.js";

const paragraphs = (blocks: Block[]) => blocks.filter((b): b is Paragraph => b.type === "paragraph");
const tables = (blocks: Block[]) => blocks.filter((b): b is Table => b.type === "table");
const textOfParagraph = (p: Paragraph) => p.inlines.map((i) => (i.type === "text" ? i.text : i.type === "tab" ? "\t" : "[img]")).join("");

/** Text, order and formatting a writer must keep; list ids and fields are allowed to change. */
function shape(blocks: Block[]): unknown[] {
  return blocks.map((b) => {
    if (b.type === "pageBreak") return "break";
    if (b.type === "table") {
      return { cols: b.columnWidths.length, rows: b.rows.map((r) => r.cells.map((c) => ({ span: c.colspan, blocks: shape(c.blocks) }))) };
    }
    return {
      align: b.align,
      left: b.leftIndent,
      first: b.firstLineIndent,
      line: b.lineSpacing,
      list: b.list && [b.list.kind, b.list.format, b.list.level, b.list.label],
      tabs: b.tabStops?.map((t) => [Math.round(t.position * 100) / 100, t.align]),
      runs: b.inlines.map((i) =>
        i.type === "text"
          ? [i.text, i.style.font, i.style.size, i.style.bold, i.style.italic, i.style.underline, i.style.strike, i.style.superscript, i.style.subscript, i.style.color, i.style.background]
          : i.type === "tab"
            ? "\t"
            : ["img", i.width, i.height, i.image.base64.length],
      ),
    };
  });
}

function roundTrip(xml: string): { before: UdfDocument; after: UdfDocument; written: string } {
  const before = parseContentXml(xml);
  const written = writeContentXml(before);
  return { before, after: parseContentXml(written), written };
}

test("writes the editor's envelope: one CDATA pool, elements, page format and the base styles", async () => {
  const { written } = roundTrip(fieldsFixture());
  assert.ok(written.startsWith('<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >'));
  assert.equal(written.match(/<!\[CDATA\[/g)?.length, 1);
  const template = parseXml(written).children.find((c): c is XmlElement => typeof c !== "string")!;
  assert.deepEqual(
    childElements(template).map((e) => e.name),
    ["content", "properties", "elements", "styles"],
  );
  assert.equal(firstChild(template, "elements")!.attrs.resolver, "hvl-default");
  const styles = childElements(firstChild(template, "styles")!).map((s) => s.attrs.name);
  assert.deepEqual(styles, ["default", "hvl-default"]);
  const zip = await JSZip.loadAsync(await writeUdf(parseContentXml(fieldsFixture())));
  assert.deepEqual(Object.keys(zip.files), ["content.xml"]);
});

test("every element points at its own slice of the pool, in order, and each paragraph ends with a newline", () => {
  for (const fixture of [fieldsFixture(), tablesFixture(), listsFixture(), headerFooterFixture()]) {
    const { written } = roundTrip(fixture);
    const template = parseXml(written).children.find((c): c is XmlElement => typeof c !== "string")!;
    const pool = textOf(firstChild(template, "content")!);
    let cursor = 0;
    const walk = (el: XmlElement) => {
      if (el.attrs.startOffset !== undefined) {
        assert.equal(Number(el.attrs.startOffset), cursor, `${el.name} starts where the previous one ended`);
        cursor += Number(el.attrs.length);
      }
      if (el.name === "paragraph") {
        const last = childElements(el).at(-1)!;
        const end = Number(last.attrs.startOffset) + Number(last.attrs.length);
        assert.equal(pool[end - 1], "\n");
      }
      for (const c of childElements(el)) walk(c);
    };
    walk(firstChild(template, "elements")!);
    assert.equal(cursor, pool.length, "the pool holds nothing unreferenced");
  }
});

test("round trip keeps text, order, run styles, tabs and lists", () => {
  for (const fixture of [fieldsFixture(), listsFixture()]) {
    const { before, after } = roundTrip(fixture);
    assert.deepEqual(shape(after.body), shape(before.body));
  }
});

test("round trip keeps the header, footer page number, landscape page and letterhead", () => {
  const { before, after, written } = roundTrip(headerFooterFixture());
  assert.deepEqual(shape(after.body), shape(before.body));
  assert.deepEqual(shape(after.header!.blocks), shape(before.header!.blocks));
  assert.deepEqual(after.footer!.pageNumber, before.footer!.pageNumber);
  assert.deepEqual(after.page, before.page);
  assert.equal(after.background!.image.base64, before.background!.image.base64);
  // The editor puts the header text first in the pool.
  assert.ok(written.indexOf("T.C. İSTANBUL") < written.indexOf("1. Davacı"));
});

test("column spans become a row's own columnSpans and row spans become an empty cell below", () => {
  const { before, after, written } = roundTrip(tablesFixture());
  assert.match(written, /<row rowName="row1" rowType="dataRow" columnSpans="120,380"/);
  const [t] = tables(after.body);
  const [orig] = tables(before.body);
  assert.deepEqual(t.columnWidths, orig.columnWidths);
  assert.deepEqual(
    t.rows.map((r) => r.cells.map((c) => c.colspan)),
    [[1, 2], [1, 1, 1], [1, 1, 1]],
  );
  // The editor has no row spans: the covered slot holds an empty cell with the same border.
  assert.equal(t.rows[1].cells[0].blocks.length, 1);
  assert.equal(textOfParagraph(t.rows[1].cells[0].blocks[0] as Paragraph), "");
  assert.equal(textOfParagraph(t.rows[1].cells[1].blocks[0] as Paragraph), "Hücre B2");
  assert.ok(t.rows[1].cells[0].borders.top);
  const nested = t.rows[2].cells[1].blocks.find((b): b is Table => b.type === "table");
  assert.deepEqual(nested?.rows[0].cells.map((c) => textOfParagraph(c.blocks[0] as Paragraph)), ["iç A", "iç B"]);
  assert.equal(t.rows[2].cells[2].borders.left, null);
});

test("column spans are whole numbers, since the editor cannot lay out a decimal one", () => {
  const doc = parseContentXml(tablesFixture());
  const [t] = tables(doc.body);
  const xml = writeContentXml({ ...doc, body: [{ ...t, columnWidths: [100.6, 173.5, 0.4] }] });
  for (const m of xml.matchAll(/columnSpans="([^"]*)"/g)) assert.match(m[1], /^\d+(,\d+)*$/);
  assert.match(xml, /<table [^>]*columnSpans="101,174,1"/);
  const proportional = writeContentXml({ ...doc, body: [{ ...t, columnWidths: [0.5, 1.5, 1] }] });
  assert.match(proportional, /<table [^>]*columnSpans="167,500,333"/);
});

test("the page number size is a whole number, or the editor will not open the file", () => {
  const doc = parseContentXml(headerFooterFixture());
  const footer = { ...doc.footer!, pageNumber: { ...doc.footer!.pageNumber!, style: { ...doc.footer!.pageNumber!.style, size: 9.5 } } };
  assert.match(writeContentXml({ ...doc, footer }), /pageNumber-fontSize="10"/);
});

test("hanging indents use Hanging and tab stops count from LeftIndent, as the editor reads them", () => {
  const doc = parseContentXml(listsFixture());
  const konu = paragraphs(doc.body).find((p) => textOfParagraph(p).startsWith("KONU"))!;
  const p: Paragraph = { ...konu, leftIndent: 150, firstLineIndent: -100, tabStops: [{ position: 150, align: "left", leader: "none" }] };
  const xml = writeContentXml({ ...doc, header: null, footer: null, background: null, body: [p] });
  assert.match(xml, /<paragraph Alignment="3" LeftIndent="50" Hanging="100" TabSet="100:0:0">/);
  const back = paragraphs(parseContentXml(xml).body)[0];
  assert.equal(back.leftIndent, 150);
  assert.equal(back.firstLineIndent, -100);
  assert.deepEqual(back.tabStops, [{ position: 150, align: "left", leader: "none" }]);
});

test("list levels are written from 1 and each level gets its own list id", () => {
  const doc = parseContentXml(listsFixture());
  const items = paragraphs(doc.body).filter((p) => p.list);
  const nested: Paragraph = { ...items[1], list: { ...items[1].list!, level: 1, listId: items[0].list!.listId } };
  const xml = writeContentXml({ ...doc, body: [items[0], nested, items[1]] });
  const lists = [...xml.matchAll(/ListLevel="(\d)" ListId="(\d+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(lists, [
    ["1", "1"],
    ["2", "2"],
    ["1", "1"],
  ]);
  const labels = paragraphs(parseContentXml(xml).body).map((p) => p.list?.label);
  assert.deepEqual(labels, ["1.", "1.", "2."]);
});

test("text that would break the XML or the pool is cleaned", async () => {
  const doc = parseContentXml(fieldsFixture());
  const p = paragraphs(doc.body)[0];
  const dirty: Paragraph = { ...p, inlines: [{ type: "text", text: "a]]>b\u0001c\nd\te", style: p.markStyle }] };
  const udf = await writeUdf({ ...doc, body: [dirty] });
  const back = await readUdf(udf);
  assert.equal(textOfParagraph(paragraphs(back.body)[0]), "a]] >bc d\te");
});
