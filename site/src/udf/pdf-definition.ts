import { ascentOf, fontFamilyFor, fontFileName, lineHeightOf, measureText } from "./fonts.js";
import type { Block, Border, ImageRun, Inline, PageNumber, Paragraph, RunStyle, Section, Table, TableCell, UdfDocument } from "./model.js";

/** A pdfmake document node. Kept loose so this module needs no pdfmake types. */
export type PdfNode = Record<string, unknown>;

export interface SectionHeights {
  header: number;
  footer: number;
}

const NBSP = " ";
const LIST_MARKER_BOX = 18;
const CELL_PADDING_X = 3;
const CELL_PADDING_Y = 1;
/** Swing puts a tab every 72pt when a paragraph has no TabSet. */
const DEFAULT_TAB = 72;
/** Swing's step when a paragraph's last tab stop is already behind. */
const PAST_LAST_TAB = 5;
const PDFKIT_IMAGES = new Set(["image/png", "image/jpeg"]);

/** The editor draws text through Java2D, which neither kerns nor forms ligatures. */
export const DEFAULT_STYLE = { font: "Tinos", fontSize: 12, fontFeatures: { kern: false, liga: false } };

/**
 * Turns the parsed model into a pdfmake document definition. It records which font files
 * and images the result needs, so the caller loads only those.
 */
export class PdfBuilder {
  readonly fontFiles = new Set<string>();
  readonly images: Record<string, string> = {};
  private imageKeys = new Map<string, string>();

  constructor(readonly doc: UdfDocument) {}

  get contentWidth(): number {
    const p = this.doc.page;
    return Math.max(36, p.width - p.marginLeft - p.marginRight);
  }

  /** Body height when there is no header or footer; caps oversized images. */
  get maxImageHeight(): number {
    const p = this.doc.page;
    return Math.max(36, p.height - p.marginTop - p.marginBottom);
  }

  sectionNodes(section: Section | null): PdfNode[] {
    return section ? this.blocks(section.blocks, this.contentWidth) : [];
  }

  /** Minimum height a section takes, which a page number alone also needs. */
  sectionFloor(section: Section | null): number {
    return section?.pageNumber ? lineHeightOf(section.pageNumber.style) : 0;
  }

  definition(heights: SectionHeights): PdfNode {
    const { page, header, footer } = this.doc;
    const headerHeight = header ? Math.max(heights.header, this.sectionFloor(header)) : 0;
    const footerHeight = footer ? Math.max(heights.footer, this.sectionFloor(footer)) : 0;
    const top = header ? Math.max(page.marginTop, page.headerOffset + headerHeight) : page.marginTop;
    const bottom = footer ? Math.max(page.marginBottom, page.footerOffset + footerHeight) : page.marginBottom;

    const content = this.blocks(this.doc.body, this.contentWidth);
    if (content.length === 0) content.push({ text: NBSP });
    const headerNodes = this.sectionNodes(header);
    const footerNodes = this.sectionNodes(footer);
    const background = this.backgroundNode();
    for (const section of [header, footer]) {
      // Page numbers are built per page later, so their font is registered up front.
      if (section?.pageNumber) this.inline("0", section.pageNumber.style);
    }

    // pdfmake lays headers and footers across the full page width, from the top of their box.
    const sectionAt = (section: Section | null, nodes: PdfNode[], boxTop: number, regionTop: number, regionHeight: number) =>
      section
        ? (currentPage: number, pageCount: number) => {
            if (currentPage < section.startPage || (section.stopPage && currentPage > section.stopPage)) return null;
            const stack: PdfNode[] = [];
            const number = section.pageNumber && this.pageNumberNode(section.pageNumber, currentPage, pageCount, regionTop - boxTop, regionHeight);
            if (number) stack.push(number);
            stack.push({ stack: nodes, margin: [page.marginLeft, regionTop - boxTop, page.marginRight, 0] });
            return { stack };
          }
        : undefined;

    return {
      pageSize: { width: page.width, height: page.height },
      pageMargins: [page.marginLeft, top, page.marginRight, bottom],
      content,
      defaultStyle: DEFAULT_STYLE,
      images: this.images,
      header: sectionAt(header, headerNodes, 0, page.headerOffset, headerHeight),
      footer: sectionAt(footer, footerNodes, page.height - bottom, page.height - page.footerOffset - footerHeight, footerHeight),
      background: background ? () => background : undefined,
      info: { creator: "UDF Çevirici", producer: "UDF Çevirici (pdfmake)" },
    };
  }

  private pageNumberNode(spec: PageNumber, page: number, total: number, regionTop: number, regionHeight: number): PdfNode | null {
    if ((spec.skipFirst && page === 1) || (spec.skipSingle && total === 1)) return null;
    const n = spec.startNumber + page - 1;
    const last = spec.startNumber + total - 1;
    const label = `${spec.prefix}${n}${spec.withTotal ? `${spec.separator}${last}` : ""}${spec.suffix}`;
    const lineHeight = lineHeightOf(spec.style);
    // Drawn 2pt inside the section's box, over its text, as the editor does.
    const y = spec.top ? regionTop + 2 : regionTop + regionHeight - 2 - lineHeight;
    const { marginLeft, marginRight } = this.doc.page;
    return {
      ...this.inline(label, spec.style),
      alignment: spec.align,
      margin: [marginLeft, 0, marginRight + (spec.align === "right" ? 1 : 0), 0],
      // Relative, because an absolute position near the page bottom leaves pdfmake no room to draw.
      relativePosition: { x: 0, y: Math.max(0, y) },
    };
  }

  private backgroundNode(): PdfNode | null {
    const bg = this.doc.background;
    if (!bg || !PDFKIT_IMAGES.has(bg.image.mime)) return null;
    const { width, height } = this.doc.page;
    return {
      image: this.imageKey(bg.image.base64, bg.image.mime),
      absolutePosition: { x: bg.marginLeft, y: bg.marginTop },
      width: Math.max(1, width - bg.marginLeft - bg.marginRight),
      height: Math.max(1, height - bg.marginTop - bg.marginBottom),
    };
  }

  private imageKey(base64: string, mime: string): string {
    let key = this.imageKeys.get(base64);
    if (!key) {
      key = `img${this.imageKeys.size}`;
      this.imageKeys.set(base64, key);
      this.images[key] = `data:${mime};base64,${base64}`;
    }
    return key;
  }

  blocks(blocks: Block[], width: number): PdfNode[] {
    const out: PdfNode[] = [];
    let pendingBreaks = 0;
    for (const block of blocks) {
      if (block.type === "pageBreak") {
        pendingBreaks++;
        continue;
      }
      const nodes = block.type === "paragraph" ? this.paragraph(block, width) : [this.table(block, width)];
      if (pendingBreaks && nodes.length) {
        // pdfmake skips a break on an empty page, so extra breaks need a filler line.
        if (out.length === 0) pendingBreaks--;
        for (let i = 1; i < pendingBreaks; i++) out.push({ text: NBSP, pageBreak: "before" });
        if (pendingBreaks > 0) nodes[0].pageBreak = "before";
        pendingBreaks = 0;
      }
      out.push(...nodes);
    }
    return out;
  }

  inline(text: string, style: RunStyle): PdfNode {
    const family = fontFamilyFor(style.font);
    this.fontFiles.add(fontFileName(family, style.bold, style.italic));
    const node: PdfNode = { text, font: family, fontSize: style.size, bold: style.bold, italics: style.italic };
    const decoration = [style.underline && "underline", style.strike && "lineThrough"].filter(Boolean);
    if (decoration.length) node.decoration = decoration.length === 1 ? decoration[0] : decoration;
    if (style.color) node.color = style.color;
    if (style.background) node.background = style.background;
    if (style.superscript) node.sup = true;
    else if (style.subscript) node.sub = true;
    return node;
  }

  /** Blank run of an exact width: two no-break spaces stretched by character spacing. */
  private spacer(width: number, style: RunStyle, leader: string): PdfNode {
    if (leader === "dots" || leader === "hyphens") {
      const ch = leader === "dots" ? "." : "-";
      const w = measureText(ch, style);
      const count = Math.floor(width / w);
      if (count >= 2) {
        return { ...this.inline(ch.repeat(count), { ...style, underline: false }), characterSpacing: (width - count * w) / (count - 1) };
      }
    }
    const nb = measureText(NBSP, style);
    const node = this.inline(NBSP + NBSP, { ...style, underline: style.underline || leader === "underline" });
    node.characterSpacing = width - 2 * nb;
    return node;
  }

  private paragraph(p: Paragraph, width: number): PdfNode[] {
    if (p.inlines.some((i) => i.type === "image")) return this.imageParagraph(p, width);

    const list = p.list;
    const left = list ? (p.leftIndent > 0 ? p.leftIndent : LIST_MARKER_BOX * (list.level + 1)) : p.leftIndent;
    let first = list ? -LIST_MARKER_BOX : p.firstLineIndent;
    if (left + first < 0) first = -left;
    // Positions run from the paragraph box's left edge, where tab stops are measured from.
    const lineEnd = Math.max(left + 10, width - p.rightIndent);
    const items: PdfNode[] = [];
    let x = left + first;

    if (list) {
      const style = (p.inlines.find((i) => i.type === "text") as { style: RunStyle } | undefined)?.style ?? p.markStyle;
      const labelWidth = measureText(list.label, style);
      items.push(this.inline(list.label, style), this.spacer(Math.max(2, LIST_MARKER_BOX - labelWidth), style, "none"));
      x = left;
    }

    p.inlines.forEach((run, index) => {
      if (run.type === "text") {
        items.push(this.inline(run.text, run.style));
        x = advance(x, run.text, run.style, left, lineEnd);
      } else if (run.type === "tab") {
        const { width: gap, leader } = this.tabWidth(p, index, x, lineEnd);
        items.push(this.spacer(gap, run.style, leader));
        x += gap;
      }
    });

    if (items.length === 0) items.push(this.inline(NBSP, p.markStyle));
    const node: PdfNode = {
      text: items,
      alignment: p.align,
      margin: [left, p.spaceAbove, p.rightIndent, p.spaceBelow],
      lineHeight: 1 + p.lineSpacing,
      preserveLeadingSpaces: true,
    };
    if (first) node.leadingIndent = first;
    return [node];
  }

  private tabWidth(p: Paragraph, index: number, x: number, lineEnd: number): { width: number; leader: string } {
    let segment = 0;
    let decimalAt = -1;
    for (let i = index + 1; i < p.inlines.length; i++) {
      const run = p.inlines[i];
      if (run.type !== "text") break;
      const dot = decimalAt < 0 ? run.text.search(/[.,]/) : -1;
      if (dot >= 0) decimalAt = segment + measureText(run.text.slice(0, dot), run.style);
      segment += measureText(run.text, run.style);
    }

    let target: number;
    let leader = "none";
    if (!p.tabStops) {
      target = (Math.floor(x / DEFAULT_TAB) + 1) * DEFAULT_TAB;
    } else {
      const stop = p.tabStops.find((s) => s.position > x + 0.01);
      if (!stop) target = x + PAST_LAST_TAB;
      else {
        leader = stop.leader;
        target =
          stop.align === "right"
            ? stop.position - segment
            : stop.align === "center"
              ? stop.position - segment / 2
              : stop.align === "decimal"
                ? stop.position - (decimalAt >= 0 ? decimalAt : segment)
                : stop.position;
      }
    }
    const width = Math.min(Math.max(target - x, 0), Math.max(0, lineEnd - x));
    return { width, leader };
  }

  private imageNode(run: ImageRun, avail: number): PdfNode {
    let { width, height } = run;
    if (width > 0 && height > 0) {
      const scale = Math.min(1, avail / width, this.maxImageHeight / height);
      width *= scale;
      height *= scale;
    }
    if (!PDFKIT_IMAGES.has(run.image.mime)) {
      const w = width || 48;
      const h = height || 48;
      return { canvas: [{ type: "rect", x: 0, y: 0, w, h, lineColor: "#9aa3ad", dash: { length: 3 } }], width: w };
    }
    const node: PdfNode = { image: this.imageKey(run.image.base64, run.image.mime) };
    if (width > 0 && height > 0) Object.assign(node, { width, height });
    else node.fit = [avail, this.maxImageHeight];
    return node;
  }

  /** pdfmake cannot put images inside a line, so a short line becomes columns and a long one a stack. */
  private imageParagraph(p: Paragraph, width: number): PdfNode[] {
    const avail = Math.max(10, width - p.leftIndent - p.rightIndent);
    const segments: (Inline[] | ImageRun)[] = [];
    for (const run of p.inlines) {
      if (run.type === "image") segments.push(run);
      else {
        const last = segments[segments.length - 1];
        if (Array.isArray(last)) last.push(run);
        else segments.push([run]);
      }
    }
    const textOf = (runs: Inline[]) => runs.map((r) => (r.type === "text" ? r.text : " ")).join("");
    const parts = segments.filter((s) => !Array.isArray(s) || textOf(s).trim() !== "");
    const margin = [p.leftIndent, p.spaceAbove, p.rightIndent, p.spaceBelow];
    const images = parts.filter((s): s is ImageRun => !Array.isArray(s));
    const runsWidth = (runs: Inline[]) => runs.reduce((w, r) => w + (r.type === "text" ? measureText(r.text, r.style) : r.type === "tab" ? 18 : 0), 0);
    const total = parts.reduce((w, s) => w + (Array.isArray(s) ? runsWidth(s) : Math.min(s.width, avail)), 0);

    if (parts.length === 1 && images.length === 1) {
      return [{ ...this.imageNode(images[0], avail), alignment: p.align === "justify" ? "left" : p.align, margin }];
    }

    if (total <= avail) {
      const rowHeight = Math.max(...images.map((i) => Math.min(i.height, this.maxImageHeight)), 0);
      const columns: PdfNode[] = parts.map((s) => {
        if (!Array.isArray(s)) return this.imageNode(s, avail);
        const style = (s.find((r) => r.type === "text") as { style: RunStyle } | undefined)?.style ?? p.markStyle;
        return {
          width: "auto",
          text: s.flatMap((r) => (r.type === "text" ? [this.inline(r.text, r.style)] : r.type === "tab" ? [this.spacer(18, r.style, "none")] : [])),
          preserveLeadingSpaces: true,
          preserveTrailingSpaces: true,
          // Sit the text on the image's bottom edge, like a baseline.
          margin: [0, Math.max(0, rowHeight - ascentOf(style)), 0, 0],
        };
      });
      if (p.align === "center" || p.align === "right") columns.unshift({ width: "*", text: "" });
      if (p.align === "center" || p.align === "left" || p.align === "justify") columns.push({ width: "*", text: "" });
      return [{ columns, columnGap: 0, margin }];
    }

    return parts.map((s, i) => {
      const m = [p.leftIndent, i === 0 ? p.spaceAbove : 0, p.rightIndent, i === parts.length - 1 ? p.spaceBelow : 0];
      if (!Array.isArray(s)) return { ...this.imageNode(s, avail), alignment: p.align === "justify" ? "left" : p.align, margin: m };
      const [node] = this.paragraph({ ...p, inlines: s, list: null, spaceAbove: 0, spaceBelow: 0 }, width);
      return { ...node, margin: m };
    });
  }

  private table(t: Table, width: number): PdfNode {
    const columns = t.columnWidths.length;
    const rowCount = t.rows.length;
    if (rowCount === 0) return { text: "" };

    const outer = columnWidths(t.columnWidths, width);
    const body: PdfNode[][] = Array.from({ length: rowCount }, () => new Array<PdfNode>(columns));
    const cells: (TableCell | null)[][] = Array.from({ length: rowCount }, () => new Array<TableCell | null>(columns).fill(null));
    const taken: boolean[][] = Array.from({ length: rowCount }, () => new Array<boolean>(columns).fill(false));

    t.rows.forEach((row, r) => {
      let c = 0;
      for (const cell of row.cells) {
        while (c < columns && taken[r][c]) c++;
        if (c >= columns) break;
        const colSpan = Math.min(cell.colspan, columns - c);
        const rowSpan = Math.min(cell.rowspan, rowCount - r);
        for (let rr = r; rr < r + rowSpan; rr++) {
          for (let cc = c; cc < c + colSpan; cc++) {
            taken[rr][cc] = true;
            cells[rr][cc] = cell;
            body[rr][cc] = {};
          }
        }
        const inner = outer.slice(c, c + colSpan).reduce((a, b) => a + b, 0) - 2 * CELL_PADDING_X;
        const node: PdfNode = {
          stack: this.blocks(cell.blocks, Math.max(10, inner)),
          border: [!!cell.borders.left, !!cell.borders.top, !!cell.borders.right, !!cell.borders.bottom],
          borderColor: [cell.borders.left, cell.borders.top, cell.borders.right, cell.borders.bottom].map((b) => b?.color ?? "#000000"),
        };
        if (colSpan > 1) node.colSpan = colSpan;
        if (rowSpan > 1) node.rowSpan = rowSpan;
        if (cell.fill) node.fillColor = cell.fill;
        if (cell.verticalAlign !== "top") node.verticalAlignment = cell.verticalAlign;
        body[r][c] = node;
        c += colSpan;
      }
      for (let cc = 0; cc < columns; cc++) {
        if (!body[r][cc]) body[r][cc] = { text: "", border: [false, false, false, false] };
      }
    });

    // pdfmake draws one width per grid line, so each line takes its widest cell edge.
    const hLine = (i: number): Border | null => {
      let best: Border | null = null;
      for (let c = 0; c < columns; c++) {
        const above = i > 0 ? cells[i - 1][c]?.borders.bottom : null;
        const below = i < rowCount ? cells[i][c]?.borders.top : null;
        for (const b of [above, below]) if (b && (!best || b.width > best.width)) best = b;
      }
      return best;
    };
    const vLine = (j: number): Border | null => {
      let best: Border | null = null;
      for (let r = 0; r < rowCount; r++) {
        const left = j > 0 ? cells[r][j - 1]?.borders.right : null;
        const right = j < columns ? cells[r][j]?.borders.left : null;
        for (const b of [left, right]) if (b && (!best || b.width > best.width)) best = b;
      }
      return best;
    };
    const dash = (b: Border | null) => (b?.style === "dotted" ? { dash: { length: 1, space: 2 } } : b?.style === "dashed" ? { dash: { length: 4, space: 3 } } : null);
    const hLines = Array.from({ length: rowCount + 1 }, (_, i) => hLine(i));
    const vLines = Array.from({ length: columns + 1 }, (_, j) => vLine(j));

    return {
      table: {
        widths: outer.map((w, j) => Math.max(1, w - 2 * CELL_PADDING_X - (vLines[j]?.width ?? 0))),
        heights: t.rows.map((r) => (r.minHeight > 0 ? r.minHeight : "auto")),
        body,
      },
      layout: {
        hLineWidth: (i: number) => hLines[i]?.width ?? 0,
        vLineWidth: (j: number) => vLines[j]?.width ?? 0,
        hLineStyle: (i: number) => dash(hLines[i]),
        vLineStyle: (j: number) => dash(vLines[j]),
        paddingLeft: () => CELL_PADDING_X,
        paddingRight: () => CELL_PADDING_X,
        paddingTop: () => CELL_PADDING_Y,
        paddingBottom: () => CELL_PADDING_Y,
      },
    };
  }
}

/** Where the text ends after laying `text` from `x` with greedy word wrap, as pdfmake does. */
function advance(x: number, text: string, style: RunStyle, lineStart: number, lineEnd: number): number {
  text.split("\n").forEach((line, i) => {
    if (i > 0) x = lineStart;
    for (const word of line.match(/\S+\s*|\s+/g) ?? []) {
      const ink = measureText(word.trimEnd(), style);
      if (x > lineStart + 0.5 && x + ink > lineEnd) x = lineStart;
      x += measureText(word, style);
    }
  });
  return x;
}

/** Column widths in points. Tiny values are proportions; oversized tables shrink to fit. */
function columnWidths(spans: number[], width: number): number[] {
  const known = spans.filter((s) => s > 0);
  const total = known.reduce((a, b) => a + b, 0);
  const fallback = known.length ? total / known.length : 1;
  const filled = spans.map((s) => (s > 0 ? s : fallback));
  const sum = filled.reduce((a, b) => a + b, 0);
  const proportional = sum < width * 0.25;
  const scale = proportional || sum > width ? width / sum : 1;
  return filled.map((s) => s * scale);
}

export function buildPdfDefinition(doc: UdfDocument, heights: SectionHeights): { definition: PdfNode; fontFiles: string[] } {
  const builder = new PdfBuilder(doc);
  const definition = builder.definition(heights);
  return { definition, fontFiles: [...builder.fontFiles] };
}
