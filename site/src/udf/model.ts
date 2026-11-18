/**
 * Renderer-neutral model of a UDF document. Styles are already resolved and lengths are in
 * points, so PDF, preview or a future DOCX writer read it without knowing UDF internals.
 */

export interface UdfDocument {
  formatId: string;
  page: PageSetup;
  header: Section | null;
  footer: Section | null;
  body: Block[];
  background: BackgroundImage | null;
  /** The raw text pool every element points into. */
  text: string;
  /** Archive entries next to content.xml, e.g. sign.sgn or comments.xml. */
  extraFiles: string[];
  signed: boolean;
  /** Element names the parser did not recognise; their text is kept as plain runs. */
  unknownElements: string[];
}

export interface PageSetup {
  /** `mediaSizeName` as written, for writers that want to keep it. */
  mediaSizeName: string;
  width: number;
  height: number;
  landscape: boolean;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  /** Distance from the top edge to the header, and from the bottom edge to the footer. */
  headerOffset: number;
  footerOffset: number;
}

export interface BackgroundImage {
  image: ImageData;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
}

export interface Section {
  blocks: Block[];
  pageNumber: PageNumber | null;
  /** First and last page (1-based) the section shows on. */
  startPage: number;
  stopPage: number | null;
}

export interface PageNumber {
  /** At the top of its section's box rather than the bottom. */
  top: boolean;
  align: "left" | "center" | "right";
  withTotal: boolean;
  skipFirst: boolean;
  skipSingle: boolean;
  prefix: string;
  suffix: string;
  separator: string;
  startNumber: number;
  style: RunStyle;
}

export type Block = Paragraph | Table | PageBreak;

export type Alignment = "left" | "center" | "right" | "justify";

export interface TabStop {
  position: number;
  align: "left" | "right" | "center" | "decimal";
  leader: "none" | "dots" | "hyphens" | "underline";
}

export interface ListInfo {
  kind: "bullet" | "number";
  /** UDF `NumberType` or `BulletType`, e.g. NUMBER_TYPE_NUMBER_DOT. */
  format: string;
  level: number;
  listId: string | null;
  /** The marker as the editor shows it, e.g. "3." or "•". */
  label: string;
}

export interface Paragraph {
  type: "paragraph";
  align: Alignment;
  leftIndent: number;
  rightIndent: number;
  /** Negative for a hanging indent. */
  firstLineIndent: number;
  /** Extra space per line as a fraction of the line height: 0.5 means 1.5 lines. */
  lineSpacing: number;
  spaceAbove: number;
  spaceBelow: number;
  /** Explicit stops measured from the left margin; null means the default 72pt grid. */
  tabStops: TabStop[] | null;
  list: ListInfo | null;
  inlines: Inline[];
  /** Font of the paragraph mark, which sets the height of an empty line. */
  markStyle: RunStyle;
}

export type Inline = TextRun | TabRun | ImageRun;

export interface TextRun {
  type: "text";
  text: string;
  style: RunStyle;
  /** Set when the run is a template field; `text` is what the field shows. */
  field?: string;
}

export interface TabRun {
  type: "tab";
  style: RunStyle;
}

export interface ImageRun {
  type: "image";
  image: ImageData;
  width: number;
  height: number;
}

export interface ImageData {
  /** Base64 without whitespace. */
  base64: string;
  mime: "image/png" | "image/jpeg" | "image/gif" | "image/bmp" | "image/webp" | "application/octet-stream";
}

export interface RunStyle {
  /** Family name as the document gives it, e.g. "Times New Roman". */
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  /** "#rrggbb", or null for the default black. */
  color: string | null;
  background: string | null;
}

export interface Table {
  type: "table";
  /** Column widths as written: points, or proportions when they are tiny. */
  columnWidths: number[];
  rows: TableRow[];
}

export interface TableRow {
  minHeight: number;
  cells: TableCell[];
}

export interface Border {
  width: number;
  color: string;
  style: "solid" | "dotted" | "dashed" | "double";
}

export interface TableCell {
  colspan: number;
  rowspan: number;
  verticalAlign: "top" | "middle" | "bottom";
  fill: string | null;
  borders: { top: Border | null; right: Border | null; bottom: Border | null; left: Border | null };
  blocks: Block[];
}

export interface PageBreak {
  type: "pageBreak";
}
