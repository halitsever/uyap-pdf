/** Turns the UDF model into a Word .docx with the `docx` package. Lengths go from points to twips. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LeaderType,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph as DocxParagraph,
  ShadingType,
  Tab,
  Table as DocxTable,
  TableCell as DocxTableCell,
  TableLayoutType,
  TableRow as DocxTableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import type { Block, Border, ImageData, Inline, ListInfo, PageNumber as UdfPageNumber, Paragraph, RunStyle, Section, Table, UdfDocument } from "./model.js";

const tw = (pt: number) => Math.round(pt * 20);
/** docx sizes images in pixels at 96 dpi. */
const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72));
const LIST_HANG = 18;

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

const BULLETS: Record<string, string> = {
  BULLET_TYPE_ELLIPSE: "•",
  BULLET_TYPE_RECTANGLE: "■",
  BULLET_TYPE_ARROW: "►",
  BULLET_TYPE_DIAMOND: "◆",
  BULLET_TYPE_DIAMOND_2: "◊",
  BULLET_TYPE_TRIANGLE: "▲",
  BULLET_TYPE_RECTANGLE_D: "□",
};

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function imageType(image: ImageData): "png" | "jpg" | "gif" | "bmp" | null {
  switch (image.mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    default:
      return null;
  }
}

function runOptions(style: RunStyle): IRunOptions {
  return {
    font: style.font,
    size: Math.round(style.size * 2),
    bold: style.bold,
    italics: style.italic,
    underline: style.underline ? {} : undefined,
    strike: style.strike,
    superScript: style.superscript,
    subScript: style.subscript,
    color: style.color ? style.color.slice(1) : undefined,
    shading: style.background ? { type: ShadingType.CLEAR, fill: style.background.slice(1), color: "auto" } : undefined,
  };
}

function borderOptions(b: Border | null) {
  if (!b) return { style: BorderStyle.NONE, size: 0, color: "auto" };
  const style = b.style === "dotted" ? BorderStyle.DOTTED : b.style === "dashed" ? BorderStyle.DASHED : b.style === "double" ? BorderStyle.DOUBLE : BorderStyle.SINGLE;
  return { style, size: Math.max(2, Math.round(b.width * 8)), color: b.color.slice(1) };
}

/** The same rule the PDF path uses: tiny widths are proportions and wide tables shrink to the text width. */
function columnWidths(spans: number[], width: number): number[] {
  const known = spans.filter((s) => s > 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const filled = spans.map((s) => (s > 0 ? s : fallback));
  const sum = filled.reduce((a, b) => a + b, 0) || 1;
  const scale = sum < width * 0.25 || sum > width ? width / sum : 1;
  return filled.map((s) => s * scale);
}

function levelText(format: string, level: number): string {
  const n = `%${level + 1}`;
  if (/_D_PARAN/.test(format)) return `(${n})`;
  if (/PARANTHESE|PARENTHESIS/.test(format)) return `${n})`;
  if (format.endsWith("_TRE")) return `${n}-`;
  return `${n}.`;
}

function levelFormat(format: string) {
  if (format.includes("ROMAN_SMALL")) return LevelFormat.LOWER_ROMAN;
  if (format.includes("ROMAN_BIG")) return LevelFormat.UPPER_ROMAN;
  if (format.includes("CHAR_SMALL")) return LevelFormat.LOWER_LETTER;
  if (format.includes("CHAR_BIG")) return LevelFormat.UPPER_LETTER;
  return LevelFormat.DECIMAL;
}

class Builder {
  private lists = new Map<string, { format: string; kind: ListInfo["kind"] }>();
  private instances = new Map<string, number>();
  private textWidth: number;

  constructor(private doc: UdfDocument) {
    this.textWidth = Math.max(72, doc.page.width - doc.page.marginLeft - doc.page.marginRight);
  }

  numberingConfig() {
    return [...this.lists.entries()].map(([reference, { format, kind }]) => ({
      reference,
      levels: Array.from({ length: 9 }, (_, level): ILevelsOptions => {
        const indent = { left: tw(LIST_HANG * (level + 1)), hanging: tw(LIST_HANG) };
        return kind === "bullet"
          ? { level, format: LevelFormat.BULLET, text: BULLETS[format] ?? "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent } } }
          : { level, format: levelFormat(format), text: levelText(format, level), alignment: AlignmentType.LEFT, style: { paragraph: { indent } } };
      }),
    }));
  }

  private listRef(list: ListInfo): { reference: string; level: number; instance: number } {
    const reference = `${list.kind}-${list.format}`;
    if (!this.lists.has(reference)) this.lists.set(reference, { format: list.format, kind: list.kind });
    const key = `${reference}|${list.listId ?? ""}`;
    let instance = this.instances.get(key);
    if (instance === undefined) this.instances.set(key, (instance = this.instances.size + 1));
    return { reference, level: Math.min(8, list.level), instance };
  }

  blocks(blocks: Block[], width: number): (DocxParagraph | DocxTable)[] {
    const out: (DocxParagraph | DocxTable)[] = [];
    let breakBefore = false;
    for (const block of blocks) {
      if (block.type === "pageBreak") {
        if (breakBefore) out.push(new DocxParagraph({ children: [new PageBreak()] }));
        breakBefore = true;
        continue;
      }
      if (block.type === "paragraph") {
        out.push(this.paragraph(block, breakBefore));
      } else {
        // Word has no page break before a table, so the break gets its own paragraph.
        if (breakBefore) out.push(new DocxParagraph({ children: [new PageBreak()] }));
        out.push(this.table(block, width));
      }
      breakBefore = false;
    }
    if (breakBefore) out.push(new DocxParagraph({ children: [new PageBreak()] }));
    return out;
  }

  private inline(run: Inline): ParagraphChild | null {
    if (run.type === "tab") return new TextRun({ ...runOptions(run.style), children: [new Tab()] });
    if (run.type === "image") {
      const type = imageType(run.image);
      if (!type) return null;
      return new ImageRun({
        type,
        data: base64Bytes(run.image.base64),
        transformation: { width: px(run.width || 72), height: px(run.height || 72) },
      });
    }
    return new TextRun({ ...runOptions(run.style), text: run.text });
  }

  paragraph(p: Paragraph, pageBreakBefore = false, extra: ParagraphChild[] = []): DocxParagraph {
    const children = p.inlines.map((i) => this.inline(i)).filter((c): c is ParagraphChild => c !== null);
    children.push(...extra);
    const options: IParagraphOptions = {
      alignment: ALIGN[p.align],
      spacing: {
        before: tw(p.spaceAbove),
        after: tw(p.spaceBelow),
        line: Math.round(240 * (1 + p.lineSpacing)),
        lineRule: LineRuleType.AUTO,
      },
      run: runOptions(p.markStyle),
      pageBreakBefore: pageBreakBefore || undefined,
      children,
    };
    if (p.list) {
      // The editor draws the marker left of the text, so the text keeps the paragraph's left indent.
      const left = Math.max(LIST_HANG, p.leftIndent);
      return new DocxParagraph({
        ...options,
        numbering: this.listRef(p.list),
        indent: { left: tw(left), hanging: tw(LIST_HANG), right: tw(p.rightIndent) },
      });
    }
    return new DocxParagraph({
      ...options,
      indent: {
        left: tw(p.leftIndent),
        right: tw(p.rightIndent),
        ...(p.firstLineIndent < 0 ? { hanging: tw(-p.firstLineIndent) } : { firstLine: tw(p.firstLineIndent) }),
      },
      tabStops: p.tabStops?.map((t) => ({
        position: tw(t.position),
        type: t.align === "right" ? TabStopType.RIGHT : t.align === "center" ? TabStopType.CENTER : t.align === "decimal" ? TabStopType.DECIMAL : TabStopType.LEFT,
        leader: t.leader === "dots" ? LeaderType.DOT : t.leader === "hyphens" ? LeaderType.HYPHEN : t.leader === "underline" ? LeaderType.UNDERSCORE : undefined,
      })),
    });
  }

  private table(t: Table, width: number): DocxTable {
    const columns = Math.max(t.columnWidths.length, ...t.rows.map((r) => r.cells.reduce((s, c) => s + c.colspan, 0)), 1);
    const spans = Array.from({ length: columns }, (_, i) => t.columnWidths[i] ?? 0);
    const widths = columnWidths(spans, width);
    const taken: boolean[][] = t.rows.map(() => new Array<boolean>(columns).fill(false));
    const rows = t.rows.map((row, r) => {
      let c = 0;
      const cells = row.cells.map((cell) => {
        while (c < columns && taken[r][c]) c++;
        const span = Math.max(1, Math.min(cell.colspan, columns - c));
        const rowSpan = Math.max(1, Math.min(cell.rowspan, t.rows.length - r));
        for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + span; cc++) if (taken[rr]) taken[rr][cc] = true;
        const cellWidth = widths.slice(c, c + span).reduce((a, b) => a + b, 0);
        c += span;
        const content = this.blocks(cell.blocks, Math.max(20, cellWidth - 11));
        // A Word cell must end with a paragraph.
        if (content.length === 0 || content[content.length - 1] instanceof DocxTable) content.push(new DocxParagraph({}));
        return new DocxTableCell({
          children: content,
          columnSpan: span > 1 ? span : undefined,
          rowSpan: rowSpan > 1 ? rowSpan : undefined,
          width: { size: tw(cellWidth), type: WidthType.DXA },
          verticalAlign: cell.verticalAlign === "middle" ? VerticalAlign.CENTER : cell.verticalAlign === "bottom" ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
          shading: cell.fill ? { type: ShadingType.CLEAR, fill: cell.fill.slice(1), color: "auto" } : undefined,
          borders: {
            top: borderOptions(cell.borders.top),
            bottom: borderOptions(cell.borders.bottom),
            left: borderOptions(cell.borders.left),
            right: borderOptions(cell.borders.right),
          },
        });
      });
      return new DocxTableRow({
        children: cells,
        height: row.minHeight > 0 ? { value: tw(row.minHeight), rule: HeightRule.ATLEAST } : undefined,
      });
    });
    const none = { style: BorderStyle.NONE, size: 0, color: "auto" };
    return new DocxTable({
      rows,
      columnWidths: widths.map(tw),
      width: { size: tw(widths.reduce((a, b) => a + b, 0)), type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    });
  }

  private pageNumberParagraph(spec: UdfPageNumber): DocxParagraph {
    const children: (string | (typeof PageNumber)[keyof typeof PageNumber])[] = [];
    if (spec.prefix) children.push(spec.prefix);
    children.push(PageNumber.CURRENT);
    if (spec.withTotal) children.push(spec.separator || "/", PageNumber.TOTAL_PAGES);
    if (spec.suffix) children.push(spec.suffix);
    return new DocxParagraph({
      alignment: ALIGN[spec.align],
      children: [new TextRun({ ...runOptions(spec.style), children })],
    });
  }

  section(s: Section | null, withNumber: boolean): (DocxParagraph | DocxTable)[] {
    const out: (DocxParagraph | DocxTable)[] = s ? this.blocks(s.blocks, this.textWidth) : [];
    if (s?.pageNumber && withNumber) {
      const number = this.pageNumberParagraph(s.pageNumber);
      if (s.pageNumber.top) out.unshift(number);
      else out.push(number);
    }
    return out;
  }

  /** The letterhead image sits behind the text, anchored to the page. */
  background(): DocxParagraph | null {
    const bg = this.doc.background;
    if (!bg) return null;
    const type = imageType(bg.image);
    if (!type) return null;
    const { width, height } = this.doc.page;
    return new DocxParagraph({
      children: [
        new ImageRun({
          type,
          data: base64Bytes(bg.image.base64),
          transformation: { width: px(width - bg.marginLeft - bg.marginRight), height: px(height - bg.marginTop - bg.marginBottom) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(bg.marginLeft * 12700) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(bg.marginTop * 12700) },
            behindDocument: true,
            wrap: { type: TextWrappingType.NONE },
          },
        }),
      ],
    });
  }
}

export async function writeDocx(doc: UdfDocument): Promise<Uint8Array> {
  const b = new Builder(doc);
  const page = doc.page;
  const textWidth = Math.max(72, page.width - page.marginLeft - page.marginRight);
  const body = b.blocks(doc.body, textWidth);
  if (body.length === 0) body.push(new DocxParagraph({}));

  const bg = b.background();
  const headerBlocks = b.section(doc.header, true);
  const footerBlocks = b.section(doc.footer, true);
  if (bg) headerBlocks.unshift(bg);

  // Word shows a different first-page header only through titlePage, which covers both skipped page numbers and startPage 2.
  const firstDiffers =
    (doc.header?.startPage ?? 1) > 1 || (doc.footer?.startPage ?? 1) > 1 || !!doc.header?.pageNumber?.skipFirst || !!doc.footer?.pageNumber?.skipFirst;
  const firstOf = (s: Section | null): (DocxParagraph | DocxTable)[] => {
    const blocks = s && s.startPage <= 1 ? b.section(s, !s.pageNumber?.skipFirst) : [];
    return blocks.length ? blocks : [new DocxParagraph({})];
  };
  const firstHeader = firstOf(doc.header);
  if (bg) firstHeader.unshift(b.background()!);

  const portrait: [number, number] = page.width <= page.height ? [page.width, page.height] : [page.height, page.width];
  const startNumber = doc.header?.pageNumber?.startNumber ?? doc.footer?.pageNumber?.startNumber ?? 1;

  const document = new Document({
    creator: "UDF Çevirici",
    styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } },
    // The editor's default tab grid is 72pt.
    defaultTabStop: 1440,
    numbering: { config: b.numberingConfig() },
    sections: [
      {
        properties: {
          titlePage: firstDiffers || undefined,
          page: {
            size: { width: tw(portrait[0]), height: tw(portrait[1]), orientation: page.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: {
              top: tw(page.marginTop),
              bottom: tw(page.marginBottom),
              left: tw(page.marginLeft),
              right: tw(page.marginRight),
              header: tw(page.headerOffset),
              footer: tw(page.footerOffset),
            },
            pageNumbers: startNumber > 1 ? { start: startNumber } : undefined,
          },
        },
        headers: {
          ...(headerBlocks.length ? { default: new Header({ children: headerBlocks }) } : {}),
          ...(firstDiffers ? { first: new Header({ children: firstHeader }) } : {}),
        },
        footers: {
          ...(footerBlocks.length ? { default: new Footer({ children: footerBlocks }) } : {}),
          ...(firstDiffers ? { first: new Footer({ children: firstOf(doc.footer) }) } : {}),
        },
        children: body,
      },
    ],
  });
  // The numbering config is filled while the body is built, so the document is created afterwards.
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
