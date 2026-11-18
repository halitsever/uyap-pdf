/**
 * Writes the model back out as a UDF: one CDATA text pool, `<elements>` pointing into it by offset,
 * and the attribute names and quirks UYAP Doküman Editörü itself saves (checked against 5.4.20).
 */
import JSZip from "jszip";
import type { Block, Border, Inline, ListInfo, PageNumber, Paragraph, RunStyle, Section, Table, TableCell, TabStop, UdfDocument } from "./model.js";

const BASE_FONT = "Times New Roman";
const BASE_SIZE = 12;
const IMAGE_CHAR = "￼";
const BREAK_CHAR = "​";

const ALIGN: Record<Paragraph["align"], string> = { left: "0", center: "1", right: "2", justify: "3" };
const TAB_ALIGN: Record<TabStop["align"], string> = { left: "0", right: "1", center: "2", decimal: "4" };
const TAB_LEADER: Record<TabStop["leader"], string> = { none: "0", dots: "1", hyphens: "2", underline: "3" };

/** Portrait sizes the editor knows by `mediaSizeName`, in points. */
const MEDIA_SIZES: [string, number, number][] = [
  ["1", 595.28, 841.89],
  ["2", 419.53, 595.28],
  ["3", 612, 792],
  ["4", 515.91, 728.5],
  ["5", 612, 1008],
  ["6", 522, 756],
];

export function mediaSizeFor(width: number, height: number): string | null {
  const [w, h] = width <= height ? [width, height] : [height, width];
  for (const [name, mw, mh] of MEDIA_SIZES) if (Math.abs(mw - w) < 6 && Math.abs(mh - h) < 6) return name;
  return null;
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** ARGB as the signed 32-bit integer Swing writes. */
export function hexToArgb(hex: string): string {
  return String((0xff000000 | parseInt(hex.slice(1, 7), 16)) | 0);
}

/** CDATA cannot hold "]]>" and XML 1.0 forbids most control characters. */
function cleanText(text: string): string {
  return text.replace(/\]\]>/g, "]] >").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "");
}

function attrs(pairs: [string, string | null | undefined][]): string {
  return pairs
    .filter((p): p is [string, string] => p[1] !== null && p[1] !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
}

function runAttrs(style: RunStyle): string {
  return attrs([
    ["family", style.font && style.font !== BASE_FONT ? style.font : null],
    ["size", style.size && style.size !== BASE_SIZE ? n(style.size) : null],
    ["bold", style.bold ? "true" : null],
    ["italic", style.italic ? "true" : null],
    ["underline", style.underline ? "true" : null],
    ["strikethrough", style.strike ? "true" : null],
    ["superscript", style.superscript ? "true" : null],
    ["subscript", style.subscript ? "true" : null],
    ["foreground", style.color ? hexToArgb(style.color) : null],
    ["background", style.background ? hexToArgb(style.background) : null],
  ]);
}

class Writer {
  pool = "";
  /** The editor keeps one counter per ListId across levels, so each level gets its own id. */
  private listIds = new Map<string, number>();

  private at(text: string): string {
    const start = this.pool.length;
    this.pool += text;
    return ` startOffset="${start}" length="${text.length}"`;
  }

  blocks(blocks: Block[]): string {
    let out = "";
    for (const block of blocks) {
      if (block.type === "paragraph") out += this.paragraph(block);
      else if (block.type === "table") out += this.table(block);
      else out += `<page-break><paragraph Alignment="0"><content${this.at(BREAK_CHAR + "\n")} /></paragraph></page-break>\n`;
    }
    return out;
  }

  private listAttrs(list: ListInfo): [string, string][] {
    const key = `${list.kind}|${list.listId ?? list.format}|${list.level}`;
    let id = this.listIds.get(key);
    if (id === undefined) this.listIds.set(key, (id = this.listIds.size + 1));
    return list.kind === "bullet"
      ? [
          ["Bulleted", "true"],
          ["BulletType", list.format.startsWith("BULLET_TYPE_") ? list.format : "BULLET_TYPE_ELLIPSE"],
          ["ListLevel", String(list.level + 1)],
          ["ListId", String(id)],
        ]
      : [
          ["Numbered", "true"],
          ["NumberType", list.format.startsWith("NUMBER_TYPE_") ? list.format : "NUMBER_TYPE_NUMBER_DOT"],
          ["ListLevel", String(list.level + 1)],
          ["ListId", String(id)],
        ];
  }

  paragraph(p: Paragraph): string {
    // The editor indents the first line by LeftIndent and wrapped lines by LeftIndent + Hanging; tab stops count from LeftIndent.
    const hanging = !p.list && p.firstLineIndent < 0 ? -p.firstLineIndent : 0;
    const left = p.list ? Math.max(0, p.leftIndent) : Math.max(0, p.leftIndent - hanging);
    const first = p.list || hanging ? 0 : p.firstLineIndent;
    const tabSet = p.tabStops?.length
      ? p.tabStops
          .filter((t) => t.position - left > 0.5)
          .map((t) => `${n(t.position - left)}:${TAB_ALIGN[t.align]}:${TAB_LEADER[t.leader]}`)
          .join(",")
      : "";
    const head = attrs([
      ["Alignment", ALIGN[p.align]],
      ["LeftIndent", left ? n(left) : null],
      ["Hanging", hanging ? n(hanging) : null],
      ["FirstLineIndent", first ? n(first) : null],
      ["RightIndent", p.rightIndent > 0 ? n(p.rightIndent) : null],
      ["LineSpacing", p.lineSpacing > 0 ? n(p.lineSpacing) : null],
      ["SpaceAbove", p.spaceAbove > 0 ? n(p.spaceAbove) : null],
      ["SpaceBelow", p.spaceBelow > 0 ? n(p.spaceBelow) : null],
      ["TabSet", tabSet || null],
      ...(p.list ? this.listAttrs(p.list) : []),
    ]);
    let body = "";
    for (const inline of p.inlines) body += this.inline(inline);
    // The closing newline carries the paragraph mark's font, which sets an empty line's height.
    body += `<content${runAttrs(p.markStyle)}${this.at("\n")} />`;
    return `<paragraph${head}>${body}</paragraph>\n`;
  }

  private inline(run: Inline): string {
    if (run.type === "tab") return `<tab${runAttrs(run.style)}${this.at("\t")} />`;
    if (run.type === "image") {
      return `<image imageData="${run.image.base64}" width="${n(run.width)}" height="${n(run.height)}"${this.at(IMAGE_CHAR)} />`;
    }
    const text = cleanText(run.text).replace(/[\r\n]+/g, " ");
    if (!text) return "";
    let out = "";
    // A tab inside a text run must become its own element so the offsets match what the editor builds.
    text.split("\t").forEach((part, i) => {
      if (i > 0) out += `<tab${runAttrs(run.style)}${this.at("\t")} />`;
      if (part) out += `<content${runAttrs(run.style)}${this.at(part)} />`;
    });
    return out;
  }

  private table(t: Table): string {
    const grid = gridWidths(t);
    const head = attrs([
      ["tableName", "Tablo"],
      ["columnCount", String(grid.length)],
      ["columnSpans", grid.map(n).join(",")],
      ["border", "borderCell"],
    ]);
    let rows = "";
    const covered = new Map<string, { span: number; borders: TableCell["borders"] }>();
    t.rows.forEach((row, r) => {
      // The editor has no row spans: a covered slot becomes an empty cell, and a column span becomes one wider cell.
      const slots: { width: number; xml: string }[] = [];
      let c = 0;
      let cellIndex = 0;
      while (c < grid.length && (cellIndex < row.cells.length || covered.has(`${r}:${c}`))) {
        const cover = covered.get(`${r}:${c}`);
        if (cover !== undefined) {
          const width = sum(grid.slice(c, c + cover.span));
          slots.push({ width, xml: `<cell${this.cellBorder(cover.borders)}>${this.emptyParagraph()}</cell>` });
          c += cover.span;
          continue;
        }
        const cell = row.cells[cellIndex++];
        const span = Math.max(1, Math.min(cell.colspan, grid.length - c));
        for (let rr = r + 1; rr < r + cell.rowspan; rr++) covered.set(`${rr}:${c}`, { span, borders: cell.borders });
        const inner = cell.blocks.length ? this.blocks(cell.blocks) : this.emptyParagraph();
        slots.push({ width: sum(grid.slice(c, c + span)), xml: `<cell${this.cellBorder(cell.borders)}>${inner}</cell>` });
        c += span;
      }
      const ownSpans = slots.length !== grid.length || slots.some((s, i) => Math.abs(s.width - grid[i]) > 0.01);
      const rowHead = attrs([
        ["rowName", `row${r + 1}`],
        ["rowType", "dataRow"],
        ["columnSpans", ownSpans ? slots.map((s) => n(s.width)).join(",") : null],
        ["height_min", row.minHeight > 0 ? n(row.minHeight) : null],
      ]);
      rows += `<row${rowHead}>${slots.map((s) => s.xml).join("")}</row>`;
    });
    return `<table${head}>${rows}</table>\n`;
  }

  /** The editor keeps one border style per cell, so the most common side wins. */
  private cellBorder(borders: TableCell["borders"]): string {
    const sides = [borders.top, borders.right, borders.bottom, borders.left];
    const present = sides.filter((b): b is Border => b !== null);
    if (present.length === 0) return attrs([["border", "borderNone"]]);
    const key = (b: Border) => `${b.width}|${b.style}|${b.color}`;
    const count = (b: Border) => present.filter((x) => key(x) === key(b)).length;
    const common = present.reduce((a, b) => (count(b) > count(a) ? b : a));
    const spec = (borders.top ? 1 : 0) | (borders.right ? 2 : 0) | (borders.bottom ? 4 : 0) | (borders.left ? 8 : 0);
    const style = common.style === "dotted" ? "borderStyle-dotted" : common.style === "dashed" ? "borderStyle-dashed" : "borderStyle-plain";
    return attrs([
      ["border", "borderCell"],
      // The editor drops a 0.5pt line on the table's left edge, so lines are at least 1pt.
      ["borderWidth", n(Math.max(1, common.width))],
      ["borderSpec", String(spec)],
      ["borderColor", hexToArgb(common.color)],
      ["borderStyle", style],
    ]);
  }

  private emptyParagraph(): string {
    return `<paragraph Alignment="0"><content${this.at("\n")} /></paragraph>`;
  }

  section(name: "header" | "footer", s: Section): string {
    const head = attrs([
      ...pageNumberAttrs(s.pageNumber),
      ["startPage", s.startPage > 1 ? String(s.startPage) : null],
      ["stopPage", s.stopPage ? String(s.stopPage) : null],
    ]);
    const blocks = s.blocks.length ? this.blocks(s.blocks) : this.emptyParagraph();
    return `<${name}${head}>${blocks.trimEnd()}</${name}>\n`;
  }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Column widths as whole points; the editor reads them as proportions of the text width.
 * A decimal width makes UYAP Doküman Editörü 5.4.20 fail to lay out the document.
 */
function gridWidths(t: Table): number[] {
  const columns = Math.max(
    t.columnWidths.length,
    ...t.rows.map((r) => r.cells.reduce((s, c) => s + c.colspan, 0)),
    1,
  );
  const known = t.columnWidths.filter((w) => w > 0);
  const fallback = known.length ? sum(known) / known.length : 100;
  const widths = Array.from({ length: columns }, (_, i) => (t.columnWidths[i] > 0 ? t.columnWidths[i] : fallback));
  const scale = sum(widths) < 200 ? 1000 / sum(widths) : 1;
  return widths.map((w) => Math.max(1, Math.round(w * scale)));
}

function pageNumberAttrs(spec: PageNumber | null): [string, string | null][] {
  if (!spec) return [];
  const bits =
    (spec.top ? 4 : 8) |
    (spec.align === "right" ? 64 : spec.align === "center" ? 32 : 16) |
    (spec.withTotal ? 2048 : 0) |
    (spec.skipFirst ? 4096 : 0) |
    (spec.skipSingle ? 8192 : 0);
  return [
    ["pageNumber-spec", `BSP32_${bits}`],
    ["pageNumber-seperator", spec.separator || "/"],
    ["pageNumber-fontBold", spec.style.bold ? "true" : "false"],
    ["pageNumber-fontItalic", spec.style.italic ? "true" : "false"],
    ["pageNumber-fontUnderline", spec.style.underline ? "true" : "false"],
    ["pageNumber-fontFace", spec.style.font || "Times New Roman"],
    // The editor refuses to open a file whose page number size has a fraction.
    ["pageNumber-fontSize", String(Math.max(1, Math.round(spec.style.size || 12)))],
    ["pageNumber-color", spec.style.color ? hexToArgb(spec.style.color) : "-16777216"],
    ["pageNumber-foreStr", spec.prefix],
    ["pageNumber-afterStr", spec.suffix || null],
    ["pageNumber-pageStartNumStr", spec.startNumber > 1 ? String(spec.startNumber) : ""],
  ];
}

export function writeContentXml(doc: UdfDocument): string {
  const w = new Writer();
  // The editor saves the header text first in the pool, then the body, then the footer.
  const header = doc.header ? w.section("header", doc.header) : "";
  const body = w.blocks(doc.body);
  const footer = doc.footer ? w.section("footer", doc.footer) : "";
  const page = doc.page;
  const media = mediaSizeFor(page.width, page.height) ?? "1";
  const pageFormat = attrs([
    ["mediaSizeName", media],
    ["leftMargin", n(page.marginLeft)],
    ["rightMargin", n(page.marginRight)],
    ["topMargin", n(page.marginTop)],
    ["bottomMargin", n(page.marginBottom)],
    ["paperOrientation", page.landscape ? "2" : "1"],
    ["headerFOffset", n(page.headerOffset)],
    ["footerFOffset", n(page.footerOffset)],
  ]);
  const bg = doc.background
    ? `<bgImage bgImageSource="arkaplan" bgImageData="${doc.background.image.base64}" bgImageUpMargin="${n(doc.background.marginTop)}" bgImageLeftMargin="${n(doc.background.marginLeft)}" bgImageBottomMargin="${n(doc.background.marginBottom)}" bgImageRigtMargin="${n(doc.background.marginRight)}" />`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n` +
    `<content><![CDATA[${w.pool}]]></content>` +
    `<properties><pageFormat${pageFormat} />${bg}</properties>\n` +
    `<elements resolver="hvl-default" >\n${header}${body}${footer}</elements>\n` +
    `<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" foreground="-13421773" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" />` +
    `<style name="hvl-default" family="${BASE_FONT}" size="${BASE_SIZE}" description="Gövde" /></styles>\n</template>\n`
  );
}

export async function writeUdf(doc: UdfDocument): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("content.xml", writeContentXml(doc));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
