import JSZip from "jszip";
import type {
  Alignment,
  BackgroundImage,
  Block,
  Border,
  ImageData,
  Inline,
  ListInfo,
  PageNumber,
  PageSetup,
  Paragraph,
  RunStyle,
  Section,
  TabStop,
  Table,
  TableCell,
  TableRow,
  UdfDocument,
} from "./model.js";
import { childElements, firstChild, parseXml, textOf, type XmlElement } from "./xml.js";

export class UdfError extends Error {
  constructor(
    readonly code: "not-zip" | "no-content" | "bad-xml",
    message: string,
  ) {
    super(message);
    this.name = "UdfError";
  }
}

/** Portrait sizes in points for the `mediaSizeName` codes the editor writes. */
const MEDIA_SIZES: Record<string, [number, number]> = {
  "1": [595.28, 841.89],
  "2": [419.53, 595.28],
  "3": [612, 792],
  "4": [515.91, 728.5],
  "5": [612, 1008],
  "6": [522, 756],
};

const DEFAULT_STYLE: Record<string, string> = { family: "Times New Roman", size: "12" };

const BULLETS: Record<string, string> = {
  BULLET_TYPE_ELLIPSE: "•",
  BULLET_TYPE_RECTANGLE: "■",
  BULLET_TYPE_ARROW: "►",
  BULLET_TYPE_DIAMOND: "◆",
  BULLET_TYPE_DIAMOND_2: "◊",
  BULLET_TYPE_TRIANGLE: "▲",
  BULLET_TYPE_RECTANGLE_D: "□",
};

/** Lookup order for one element: its own attributes, its named style chain, then its parents. */
type Scope = Record<string, string>[];

interface Ctx {
  pool: string;
  styles: Map<string, Record<string, string>>;
  unknown: Set<string>;
  lists: ListCounter;
}

export async function readUdf(bytes: Uint8Array | ArrayBuffer): Promise<UdfDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new UdfError("not-zip", `Not a UDF archive: ${(e as Error).message}`);
  }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const contentName = names.find((n) => n.toLowerCase() === "content.xml") ?? names.find((n) => /(^|\/)content\.xml$/i.test(n));
  if (!contentName) throw new UdfError("no-content", "content.xml is missing");
  const raw = await zip.files[contentName].async("uint8array");
  const doc = parseContentXml(decodeXmlBytes(raw));
  doc.extraFiles = names.filter((n) => n !== contentName);
  doc.signed = doc.extraFiles.some((n) => /(^|\/)sign\.sgn$/i.test(n));
  return doc;
}

/** Honours the declared encoding, since older editors may not have written UTF-8. */
function decodeXmlBytes(raw: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(raw.subarray(0, 200));
  const declared = /encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(raw);
  } catch {
    return new TextDecoder("utf-8").decode(raw);
  }
}

export function parseContentXml(xml: string): UdfDocument {
  const root = parseXml(xml);
  const template = firstChild(root, "template") ?? childElements(root)[0];
  if (!template) throw new UdfError("bad-xml", "content.xml has no root element");

  const contentEl = firstChild(template, "content");
  const pool = contentEl ? textOf(contentEl) : "";

  const styles = new Map<string, Record<string, string>>();
  const stylesEl = firstChild(template, "styles");
  if (stylesEl) for (const s of childElements(stylesEl, "style")) if (s.attrs.name) styles.set(s.attrs.name, s.attrs);

  const ctx: Ctx = { pool, styles, unknown: new Set(), lists: new ListCounter() };
  const props = firstChild(template, "properties");
  const page = parsePageSetup(props ? firstChild(props, "pageFormat") : undefined);
  const background = parseBackground(props ? firstChild(props, "bgImage") : undefined);

  const elementsEl = firstChild(template, "elements");
  const rootScope = withStyles(ctx, elementsEl?.attrs ?? {}, [DEFAULT_STYLE]);
  let header: Section | null = null;
  let footer: Section | null = null;
  const body: Block[] = [];

  if (elementsEl) {
    for (const el of childElements(elementsEl)) {
      if (el.name === "header" || el.name === "footer") {
        const section = parseSection(ctx, el, rootScope);
        if (el.name === "header") header = section;
        else footer = section;
      } else {
        parseBlock(ctx, el, rootScope, body);
      }
    }
  }

  if (body.length === 0 && !header && !footer && pool.trim()) {
    // Without usable elements the text pool still holds the whole document.
    for (const line of pool.replace(/\n$/, "").split("\n")) body.push(plainParagraph(ctx, line, rootScope));
  }

  return {
    formatId: template.attrs.format_id ?? "",
    page,
    header,
    footer,
    body,
    background,
    text: pool,
    extraFiles: [],
    signed: false,
    unknownElements: [...ctx.unknown],
  };
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function lookup(scope: Scope, key: string): string | undefined {
  for (const attrs of scope) if (attrs[key] !== undefined) return attrs[key];
  return undefined;
}

function withStyles(ctx: Ctx, attrs: Record<string, string>, parent: Scope): Scope {
  const chain: Scope = [attrs];
  let name = attrs.resolver;
  const seen = new Set<string>();
  while (name && !seen.has(name)) {
    seen.add(name);
    const style = ctx.styles.get(name);
    if (!style) break;
    chain.push(style);
    name = style.resolver;
  }
  return chain.concat(parent);
}

/** UDF colours are signed 32-bit ARGB integers. */
export function argbToHex(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");
}

function parsePageSetup(el: XmlElement | undefined): PageSetup {
  const a = el?.attrs ?? {};
  const media = a.mediaSizeName ?? "1";
  const [w, h] = MEDIA_SIZES[media] ?? MEDIA_SIZES["1"];
  // Java's PageFormat: 1 is portrait, 0 and 2 are the two landscape modes.
  const landscape = a.paperOrientation !== undefined && a.paperOrientation !== "1";
  return {
    mediaSizeName: media,
    width: landscape ? h : w,
    height: landscape ? w : h,
    landscape,
    marginLeft: num(a.leftMargin, 42.52),
    marginRight: num(a.rightMargin, 28.35),
    marginTop: num(a.topMargin, 14.17),
    marginBottom: num(a.bottomMargin, 14.17),
    headerOffset: num(a.headerFOffset, 20),
    footerOffset: num(a.footerFOffset, 20),
  };
}

function imageData(base64: string): ImageData | null {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  if (!clean) return null;
  const mime: ImageData["mime"] = clean.startsWith("iVBOR")
    ? "image/png"
    : clean.startsWith("/9j/")
      ? "image/jpeg"
      : clean.startsWith("R0lG")
        ? "image/gif"
        : clean.startsWith("Qk")
          ? "image/bmp"
          : clean.startsWith("UklGR")
            ? "image/webp"
            : "application/octet-stream";
  return { base64: clean, mime };
}

function parseBackground(el: XmlElement | undefined): BackgroundImage | null {
  if (!el) return null;
  const image = imageData(el.attrs.bgImageData ?? "");
  if (!image) return null;
  const a = el.attrs;
  return {
    image,
    marginTop: num(a.bgImageUpMargin, 0),
    marginBottom: num(a.bgImageBottomMargin, 0),
    marginLeft: num(a.bgImageLeftMargin, 0),
    // The editor writes "Rigt"; accept the correct spelling too.
    marginRight: num(a.bgImageRigtMargin ?? a.bgImageRightMargin, 0),
  };
}

function parseSection(ctx: Ctx, el: XmlElement, parent: Scope): Section {
  const scope = withStyles(ctx, el.attrs, parent);
  const blocks: Block[] = [];
  for (const child of childElements(el)) parseBlock(ctx, child, scope, blocks);
  return {
    blocks,
    pageNumber: parsePageNumber(el.attrs),
    startPage: Math.max(1, Math.floor(num(el.attrs.startPage, 1))),
    stopPage: el.attrs.stopPage ? Math.floor(num(el.attrs.stopPage, 0)) || null : null,
  };
}

/** `pageNumber-spec` is BSP32_<bits>: 4 top, 8 bottom, 16/32/64 left/centre/right, 2048 total, 4096 not on page 1, 8192 not when single. */
function parsePageNumber(a: Record<string, string>): PageNumber | null {
  const spec = a["pageNumber-spec"];
  const bits = spec?.startsWith("BSP32_") ? parseInt(spec.slice(6), 10) : 0;
  if (!bits) return null;
  return {
    top: (bits & 8) === 0,
    align: bits & 64 ? "right" : bits & 32 ? "center" : "left",
    withTotal: (bits & 2048) !== 0,
    skipFirst: (bits & 4096) !== 0,
    skipSingle: (bits & 8192) !== 0,
    prefix: a["pageNumber-foreStr"] ?? "",
    suffix: a["pageNumber-afterStr"] ?? "",
    separator: a["pageNumber-seperator"] ?? "/",
    startNumber: Math.floor(num(a["pageNumber-pageStartNumStr"], 1)) || 1,
    style: {
      ...baseStyle(),
      font: a["pageNumber-fontFace"] || "Arial",
      size: num(a["pageNumber-fontSize"], 11),
      bold: a["pageNumber-fontBold"] === "true",
      italic: a["pageNumber-fontItalic"] === "true",
      underline: a["pageNumber-fontUnderline"] === "true",
      color: nonBlack(argbToHex(a["pageNumber-color"])),
    },
  };
}

function baseStyle(): RunStyle {
  return {
    font: "Times New Roman",
    size: 12,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    superscript: false,
    subscript: false,
    color: null,
    background: null,
  };
}

function nonBlack(hex: string | null): string | null {
  return hex === "#000000" ? null : hex;
}

function runStyle(scope: Scope): RunStyle {
  const background = argbToHex(lookup(scope, "background"));
  return {
    font: lookup(scope, "family") || "Times New Roman",
    size: num(lookup(scope, "size"), 12) || 12,
    bold: lookup(scope, "bold") === "true",
    italic: lookup(scope, "italic") === "true",
    underline: lookup(scope, "underline") === "true",
    strike: lookup(scope, "strikethrough") === "true",
    superscript: lookup(scope, "superscript") === "true",
    subscript: lookup(scope, "subscript") === "true",
    color: nonBlack(argbToHex(lookup(scope, "foreground"))),
    background: background === "#ffffff" ? null : background,
  };
}

function sliceText(ctx: Ctx, a: Record<string, string>): string | null {
  if (a.startOffset === undefined) return null;
  const start = Math.max(0, Math.floor(num(a.startOffset, 0)));
  const length = Math.max(0, Math.floor(num(a.length, 0)));
  return ctx.pool.slice(start, start + length);
}

function parseBlock(ctx: Ctx, el: XmlElement, scope: Scope, out: Block[]): void {
  switch (el.name) {
    case "paragraph":
      out.push(parseParagraph(ctx, el, scope));
      return;
    case "table":
      out.push(parseTable(ctx, el, scope));
      return;
    case "page-break": {
      // The wrapped paragraph is the break's own mark; keep it only when it carries text.
      for (const child of childElements(el)) {
        const before: Block[] = [];
        parseBlock(ctx, child, scope, before);
        for (const b of before) if (b.type !== "paragraph" || hasVisibleContent(b)) out.push(b);
      }
      out.push({ type: "pageBreak" });
      return;
    }
    default: {
      ctx.unknown.add(el.name);
      const kids = childElements(el);
      if (kids.length) {
        const inner = withStyles(ctx, el.attrs, scope);
        for (const child of kids) parseBlock(ctx, child, inner, out);
      } else {
        const text = sliceText(ctx, el.attrs);
        if (text && text.replace(/[\n​￼]/g, "").trim()) {
          out.push(plainParagraph(ctx, text, withStyles(ctx, el.attrs, scope)));
        }
      }
    }
  }
}

function hasVisibleContent(p: Paragraph): boolean {
  return p.inlines.some((i) => i.type !== "text" || i.text.trim() !== "");
}

function plainParagraph(ctx: Ctx, text: string, scope: Scope): Paragraph {
  const p = paragraphShell(scope);
  p.inlines = textInlines(text.replace(/\n$/, ""), runStyle(scope));
  return p;
}

/** Splits embedded tab characters into tab runs and drops placeholder characters. */
function textInlines(text: string, style: RunStyle, field?: string): Inline[] {
  const clean = text.replace(/[​￼\r]/g, "");
  const out: Inline[] = [];
  clean.split("\t").forEach((part, i) => {
    if (i > 0) out.push({ type: "tab", style });
    if (part) out.push(field ? { type: "text", text: part, style, field } : { type: "text", text: part, style });
  });
  return out;
}

const ALIGNMENTS: Record<string, Alignment> = { "0": "left", "1": "center", "2": "right", "3": "justify" };

function parseTabSet(value: string | undefined): TabStop[] | null {
  if (!value) return null;
  const stops: TabStop[] = [];
  for (const part of value.split(/[,;]/)) {
    const [pos, align, leader] = part.split(":");
    const position = parseFloat(pos);
    if (!Number.isFinite(position)) continue;
    // Swing TabStop constants, which the editor writes as they are.
    stops.push({
      position,
      align: align === "1" ? "right" : align === "2" ? "center" : align === "4" ? "decimal" : "left",
      leader: leader === "1" ? "dots" : leader === "2" ? "hyphens" : leader === "3" ? "underline" : "none",
    });
  }
  stops.sort((a, b) => a.position - b.position);
  return stops.length ? stops : null;
}

function paragraphShell(scope: Scope): Paragraph {
  const hanging = num(lookup(scope, "Hanging"), 0);
  return {
    type: "paragraph",
    align: ALIGNMENTS[lookup(scope, "Alignment") ?? "0"] ?? "left",
    leftIndent: num(lookup(scope, "LeftIndent"), 0) + hanging,
    rightIndent: num(lookup(scope, "RightIndent"), 0),
    firstLineIndent: num(lookup(scope, "FirstLineIndent"), 0) - hanging,
    lineSpacing: Math.max(0, num(lookup(scope, "LineSpacing"), 0)),
    spaceAbove: Math.max(0, num(lookup(scope, "SpaceAbove"), 0)),
    spaceBelow: Math.max(0, num(lookup(scope, "SpaceBelow"), 0)),
    tabStops: parseTabSet(lookup(scope, "TabSet")),
    list: null,
    inlines: [],
    markStyle: runStyle(scope),
  };
}

function parseParagraph(ctx: Ctx, el: XmlElement, parent: Scope): Paragraph {
  const scope = withStyles(ctx, el.attrs, parent);
  const p = paragraphShell(scope);
  const inlines: Inline[] = [];
  let markStyle: RunStyle | null = null;

  for (const child of childElements(el)) {
    const childScope = withStyles(ctx, child.attrs, scope);
    if (child.name === "image") {
      const image = imageData(child.attrs.imageData ?? "");
      if (image) {
        inlines.push({ type: "image", image, width: num(child.attrs.width, 0), height: num(child.attrs.height, 0) });
      }
      continue;
    }
    if (child.name === "tab") {
      inlines.push({ type: "tab", style: runStyle(childScope) });
      continue;
    }
    if (child.name !== "content" && child.name !== "field" && child.name !== "space") ctx.unknown.add(child.name);
    const style = runStyle(childScope);
    markStyle = style;
    const text = sliceText(ctx, child.attrs) ?? textOf(child);
    const field = child.name === "field" ? child.attrs.fieldName || "field" : undefined;
    inlines.push(...textInlines(text, style, field));
  }

  // The paragraph's closing newline sits in its last run.
  for (let i = inlines.length - 1; i >= 0; i--) {
    const run = inlines[i];
    if (run.type !== "text") break;
    run.text = run.text.replace(/\n+$/, "");
    if (run.text) break;
    inlines.splice(i, 1);
  }
  p.inlines = inlines;
  if (markStyle) p.markStyle = markStyle;
  p.list = ctx.lists.next(scope);
  return p;
}

function parseBorder(scope: Scope): Border | null {
  const style = lookup(scope, "borderStyle") ?? "borderStyle-solid";
  if (style === "borderStyle-none") return null;
  const width = num(lookup(scope, "borderWidth"), 0.5);
  if (width <= 0) return null;
  const color = lookup(scope, "borderColor");
  return {
    width,
    // A border colour of 0 is the editor's default black.
    color: argbToHex(color === undefined || color === "0" ? "-16777216" : color) ?? "#000000",
    style: style.endsWith("dotted") ? "dotted" : style.endsWith("dashed") ? "dashed" : style.endsWith("double") ? "double" : "solid",
  };
}

function parseTable(ctx: Ctx, el: XmlElement, parent: Scope): Table {
  const scope = withStyles(ctx, el.attrs, parent);
  const widths = (el.attrs.columnSpans ?? "")
    .split(",")
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const columnCount = Math.max(Math.floor(num(el.attrs.columnCount, 0)), widths.length);
  const rowHeights = (el.attrs.rowSpans ?? "").split(",").map((s) => parseFloat(s));
  const rows: TableRow[] = [];

  childElements(el, "row").forEach((rowEl, rowIndex) => {
    const rowScope = withStyles(ctx, rowEl.attrs, scope);
    const cells: TableCell[] = [];
    for (const cellEl of childElements(rowEl, "cell")) {
      const cellScope = withStyles(ctx, cellEl.attrs, rowScope);
      const blocks: Block[] = [];
      for (const child of childElements(cellEl)) parseBlock(ctx, child, cellScope, blocks);
      const borderName = lookup(cellScope, "border") ?? "borderCell";
      const border = borderName === "borderNone" ? null : parseBorder(cellScope);
      const spec = Math.floor(num(lookup(cellScope, "borderSpec"), 15));
      const fill = argbToHex(cellEl.attrs.fillColor);
      const valign = cellEl.attrs.align;
      cells.push({
        colspan: Math.max(1, Math.floor(num(cellEl.attrs.colspan, 1))),
        rowspan: Math.max(1, Math.floor(num(cellEl.attrs.rowspan, 1))),
        verticalAlign: valign === "vcenter" || valign === "center" || valign === "middle" ? "middle" : valign === "bottom" ? "bottom" : "top",
        fill: fill === "#ffffff" ? null : fill,
        borders: {
          top: spec & 1 ? border : null,
          right: spec & 2 ? border : null,
          bottom: spec & 4 ? border : null,
          left: spec & 8 ? border : null,
        },
        blocks,
      });
    }
    const minHeight = Math.max(num(rowEl.attrs.height, 0), num(rowEl.attrs.height_min, 0), rowHeights[rowIndex] || 0);
    rows.push({ minHeight, cells });
  });

  const widest = rows.reduce(
    (max, r) =>
      Math.max(
        max,
        r.cells.reduce((s, c) => s + c.colspan, 0),
      ),
    0,
  );
  const columns = Math.max(columnCount, widest, 1);
  const columnWidths = Array.from({ length: columns }, (_, i) => widths[i] ?? 0);
  return { type: "table", columnWidths, rows };
}

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function roman(n: number): string {
  let out = "";
  for (const [value, letters] of ROMAN) while (n >= value) ((out += letters), (n -= value));
  return out;
}

function letters(n: number): string {
  let out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function numberLabel(format: string, n: number): string {
  const suffix = format.includes("PARENTHESIS") ? ")" : ".";
  if (format.includes("ROMAN_SMALL")) return roman(n) + suffix;
  if (format.includes("ROMAN_BIG")) return roman(n).toUpperCase() + suffix;
  if (format.includes("CHAR_SMALL")) return letters(n) + suffix;
  if (format.includes("CHAR_BIG")) return letters(n).toUpperCase() + suffix;
  return String(n) + suffix;
}

/** Numbers list items in document order, the way the editor counts them. */
class ListCounter {
  private counters = new Map<string, number[]>();
  private lastKey: string | null = null;

  next(scope: Scope): ListInfo | null {
    const numbered = lookup(scope, "Numbered") === "true";
    const bulleted = lookup(scope, "Bulleted") === "true";
    if (!numbered && !bulleted) {
      this.lastKey = null;
      return null;
    }
    const level = Math.max(0, Math.floor(num(lookup(scope, "ListLevel"), 0)));
    const listId = lookup(scope, "ListId") ?? null;
    if (bulleted) {
      const format = lookup(scope, "BulletType") ?? "BULLET_TYPE_ELLIPSE";
      return { kind: "bullet", format, level, listId, label: BULLETS[format] ?? "•" };
    }
    const format = lookup(scope, "NumberType") ?? "NUMBER_TYPE_NUMBER_DOT";
    // Without a list id, a run of numbered paragraphs is one list.
    const key = listId ?? `anon:${format}`;
    if (listId === null && this.lastKey !== key) this.counters.delete(key);
    this.lastKey = key;
    const levels = this.counters.get(key) ?? [];
    levels.length = level + 1;
    levels[level] = (levels[level] ?? 0) + 1;
    for (let i = 0; i < level; i++) levels[i] ??= 1;
    this.counters.set(key, levels);
    return { kind: "number", format, level, listId, label: numberLabel(format, levels[level]) };
  }
}
