/**
 * Reads a Word .docx into the UDF model without a DOM, so it runs in the browser and in Node tests.
 * Styles, numbering and theme fonts are resolved here, and lengths become points.
 */
import JSZip from "jszip";
import type {
  Alignment,
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
  TextRun,
  UdfDocument,
} from "./model.js";
import { parseXml, type XmlElement, type XmlNode } from "./xml.js";

export type DocxErrorCode = "not-zip" | "not-docx" | "doc-binary" | "encrypted" | "rtf";

export class DocxError extends Error {
  constructor(
    readonly code: DocxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocxError";
  }
}

/** Things the UDF cannot hold or this reader does not carry; the page lists them to the user. */
export type DocxNote = "textbox" | "chart" | "shape" | "comments" | "image-format" | "sections" | "embedded" | "page-size" | "footnotes";

export interface DocxResult {
  doc: UdfDocument;
  notes: DocxNote[];
}

const REL_OFFICE_DOCUMENT = /\/officeDocument$/;


function stripPrefixes(node: XmlElement): XmlElement {
  const local = (name: string) => name.slice(name.indexOf(":") + 1);
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.attrs)) {
    // Keep the first of a clash (e.g. w:id and r:id), except that a relationship id always wins as "rid".
    if (k.startsWith("r:")) attrs["r" + local(k)] = v;
    else if (!(local(k) in attrs)) attrs[local(k)] = v;
  }
  const children: XmlNode[] = node.children.map((c) => (typeof c === "string" ? c : stripPrefixes(c)));
  return { name: local(node.name), attrs, children };
}

function kids(el: XmlElement | undefined, name?: string): XmlElement[] {
  if (!el) return [];
  const out: XmlElement[] = [];
  for (const c of el.children) if (typeof c !== "string" && (name === undefined || c.name === name)) out.push(c);
  return out;
}

function kid(el: XmlElement | undefined, name: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== "string" && c.name === name) return c;
  return undefined;
}

function find(el: XmlElement, name: string): XmlElement | undefined {
  for (const c of el.children) {
    if (typeof c === "string") continue;
    if (c.name === name) return c;
    const deep = find(c, name);
    if (deep) return deep;
  }
  return undefined;
}

function findAll(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (typeof c === "string") continue;
    if (c.name === name) out.push(c);
    else findAll(c, name, out);
  }
  return out;
}

function text(el: XmlElement): string {
  let out = "";
  for (const c of el.children) out += typeof c === "string" ? c : text(c);
  return out;
}

function int(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

function flag(v: string | undefined): boolean {
  return !(v === "0" || v === "false" || v === "off" || v === "none");
}

/** OOXML on/off: present means on unless val says otherwise. */
function onOff(el: XmlElement | undefined): boolean | undefined {
  return el ? flag(el.attrs.val) : undefined;
}

const twip = (v: number) => v / 20;


interface TabDef {
  pos: number;
  val: string;
  leader: string;
}

interface PProps {
  align?: Alignment;
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: string;
  tabs?: TabDef[];
  numId?: string;
  ilvl?: number;
  pageBreakBefore?: boolean;
  contextual?: boolean;
}

interface RProps {
  font?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string | null;
  highlight?: string | null;
  shading?: string | null;
  vert?: string;
  caps?: boolean;
  vanish?: boolean;
}

const HIGHLIGHTS: Record<string, string> = {
  yellow: "#ffff00",
  green: "#00ff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  blue: "#0000ff",
  red: "#ff0000",
  darkBlue: "#000080",
  darkCyan: "#008080",
  darkGreen: "#008000",
  darkMagenta: "#800080",
  darkRed: "#800000",
  darkYellow: "#808000",
  darkGray: "#808080",
  lightGray: "#c0c0c0",
  black: "#000000",
  white: "#ffffff",
};

function hex(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === "auto") return null;
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : undefined;
}

function readAlign(v: string | undefined): Alignment | undefined {
  switch (v) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "both":
    case "distribute":
    case "thaiDistribute":
    case "lowKashida":
    case "mediumKashida":
    case "highKashida":
      return "justify";
    default:
      return undefined;
  }
}

function readPPr(pPr: XmlElement | undefined): PProps {
  const out: PProps = {};
  if (!pPr) return out;
  const align = readAlign(kid(pPr, "jc")?.attrs.val);
  if (align) out.align = align;
  const ind = kid(pPr, "ind");
  if (ind) {
    const a = ind.attrs;
    const left = int(a.left ?? a.start);
    const right = int(a.right ?? a.end);
    if (left !== undefined) out.left = twip(left);
    if (right !== undefined) out.right = twip(right);
    if (a.hanging !== undefined) {
      out.hanging = twip(int(a.hanging) ?? 0);
      out.firstLine = undefined;
    } else if (a.firstLine !== undefined) {
      out.firstLine = twip(int(a.firstLine) ?? 0);
      out.hanging = 0;
    }
  }
  const spacing = kid(pPr, "spacing");
  if (spacing) {
    const a = spacing.attrs;
    if (a.beforeAutospacing !== undefined && flag(a.beforeAutospacing)) out.before = 14;
    else if (a.before !== undefined) out.before = twip(int(a.before) ?? 0);
    if (a.afterAutospacing !== undefined && flag(a.afterAutospacing)) out.after = 14;
    else if (a.after !== undefined) out.after = twip(int(a.after) ?? 0);
    if (a.line !== undefined) {
      out.line = int(a.line);
      out.lineRule = a.lineRule ?? "auto";
    }
  }
  const tabs = kid(pPr, "tabs");
  if (tabs) {
    out.tabs = kids(tabs, "tab").map((t) => ({ pos: twip(int(t.attrs.pos) ?? 0), val: t.attrs.val ?? "left", leader: t.attrs.leader ?? "none" }));
  }
  const numPr = kid(pPr, "numPr");
  if (numPr) {
    const numId = kid(numPr, "numId")?.attrs.val;
    if (numId !== undefined) out.numId = numId;
    const ilvl = int(kid(numPr, "ilvl")?.attrs.val);
    if (ilvl !== undefined) out.ilvl = ilvl;
  }
  const pbb = onOff(kid(pPr, "pageBreakBefore"));
  if (pbb !== undefined) out.pageBreakBefore = pbb;
  const ctx = onOff(kid(pPr, "contextualSpacing"));
  if (ctx !== undefined) out.contextual = ctx;
  return out;
}

function mergeP(base: PProps, over: PProps): PProps {
  const out: PProps = { ...base };
  for (const [k, v] of Object.entries(over) as [keyof PProps, unknown][]) {
    if (v === undefined || k === "tabs") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  if (over.hanging !== undefined && over.firstLine === undefined) out.firstLine = undefined;
  if (over.tabs) {
    // A "clear" tab removes the inherited stop at the same position.
    const merged = (base.tabs ?? []).filter((t) => !over.tabs!.some((o) => Math.abs(o.pos - t.pos) < 0.5));
    out.tabs = merged.concat(over.tabs.filter((t) => t.val !== "clear"));
  }
  return out;
}

interface Theme {
  major: string;
  minor: string;
}

function readRPr(rPr: XmlElement | undefined, theme: Theme): RProps {
  const out: RProps = {};
  if (!rPr) return out;
  const fonts = kid(rPr, "rFonts");
  if (fonts) {
    const a = fonts.attrs;
    const themed = a.asciiTheme ?? a.hAnsiTheme;
    const font = a.ascii ?? a.hAnsi ?? (themed ? (themed.startsWith("major") ? theme.major : theme.minor) : undefined) ?? a.cs ?? a.eastAsia;
    if (font) out.font = font;
  }
  const sz = int(kid(rPr, "sz")?.attrs.val);
  if (sz !== undefined) out.size = sz / 2;
  const b = onOff(kid(rPr, "b"));
  if (b !== undefined) out.bold = b;
  const i = onOff(kid(rPr, "i"));
  if (i !== undefined) out.italic = i;
  const u = kid(rPr, "u");
  if (u) out.underline = u.attrs.val !== "none" && u.attrs.val !== "0";
  const strike = onOff(kid(rPr, "strike")) ?? onOff(kid(rPr, "dstrike"));
  if (strike !== undefined) out.strike = strike;
  const color = hex(kid(rPr, "color")?.attrs.val);
  if (color !== undefined) out.color = color;
  const hl = kid(rPr, "highlight")?.attrs.val;
  if (hl !== undefined) out.highlight = hl === "none" ? null : (HIGHLIGHTS[hl] ?? null);
  const shd = kid(rPr, "shd");
  if (shd) {
    const fill = hex(shd.attrs.fill);
    if (fill !== undefined) out.shading = fill;
  }
  const vert = kid(rPr, "vertAlign")?.attrs.val;
  if (vert) out.vert = vert;
  const caps = onOff(kid(rPr, "caps"));
  if (caps !== undefined) out.caps = caps;
  const vanish = onOff(kid(rPr, "vanish"));
  if (vanish !== undefined) out.vanish = vanish;
  return out;
}

function mergeR(base: RProps, over: RProps): RProps {
  const out: RProps = { ...base };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

function toRunStyle(r: RProps): RunStyle {
  const background = r.highlight ?? r.shading ?? null;
  return {
    font: r.font ?? "Times New Roman",
    size: r.size ?? 10,
    bold: !!r.bold,
    italic: !!r.italic,
    underline: !!r.underline,
    strike: !!r.strike,
    superscript: r.vert === "superscript",
    subscript: r.vert === "subscript",
    color: r.color && r.color !== "#000000" ? r.color : null,
    background: background && background !== "#ffffff" ? background : null,
  };
}


interface StyleDef {
  type: string;
  basedOn?: string;
  pPr: PProps;
  rPr: RProps;
  tblBorders?: XmlElement;
}

class Styles {
  private defs = new Map<string, StyleDef>();
  defaultP: PProps = {};
  defaultR: RProps = {};
  defaultParagraphStyle: string | undefined;
  defaultTableStyle: string | undefined;

  constructor(root: XmlElement | undefined, theme: Theme) {
    if (!root) return;
    const defaults = kid(root, "docDefaults");
    this.defaultR = readRPr(kid(kid(defaults, "rPrDefault"), "rPr"), theme);
    this.defaultP = readPPr(kid(kid(defaults, "pPrDefault"), "pPr"));
    for (const s of kids(root, "style")) {
      const id = s.attrs.styleId;
      if (!id) continue;
      const type = s.attrs.type ?? "paragraph";
      this.defs.set(id, {
        type,
        basedOn: kid(s, "basedOn")?.attrs.val,
        pPr: readPPr(kid(s, "pPr")),
        rPr: readRPr(kid(s, "rPr"), theme),
        tblBorders: kid(kid(s, "tblPr"), "tblBorders"),
      });
      if (flag(s.attrs.default ?? "0")) {
        if (type === "paragraph") this.defaultParagraphStyle = id;
        if (type === "table") this.defaultTableStyle = id;
      }
    }
  }

  private chain(id: string | undefined): StyleDef[] {
    const out: StyleDef[] = [];
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const def = this.defs.get(id);
      if (!def) break;
      out.unshift(def);
      id = def.basedOn;
    }
    return out;
  }

  paragraph(id: string | undefined): { pPr: PProps; rPr: RProps } {
    let pPr = this.defaultP;
    let rPr = this.defaultR;
    for (const def of this.chain(id ?? this.defaultParagraphStyle)) {
      pPr = mergeP(pPr, def.pPr);
      rPr = mergeR(rPr, def.rPr);
    }
    return { pPr, rPr };
  }

  character(id: string | undefined): RProps {
    let rPr: RProps = {};
    for (const def of this.chain(id)) rPr = mergeR(rPr, def.rPr);
    return rPr;
  }

  tableBorders(id: string | undefined): XmlElement | undefined {
    let borders: XmlElement | undefined;
    for (const def of this.chain(id ?? this.defaultTableStyle)) if (def.tblBorders) borders = def.tblBorders;
    return borders;
  }
}

interface Level {
  fmt: string;
  text: string;
  start: number;
  pPr: PProps;
  rPr: RProps;
}

class Numbering {
  private abstracts = new Map<string, Level[]>();
  private nums = new Map<string, { abstractId: string; starts: Map<number, number>; levels: Map<number, Level> }>();
  /** Counters per abstract list, since Word continues numbering across w:num entries that share one. */
  private counters = new Map<string, number[]>();
  private instances = new Map<string, number>();
  private restarted = new Set<string>();

  constructor(root: XmlElement | undefined, theme: Theme) {
    if (!root) return;
    for (const a of kids(root, "abstractNum")) {
      this.abstracts.set(a.attrs.abstractNumId ?? "", this.levels(a, theme));
    }
    for (const num of kids(root, "num")) {
      const starts = new Map<number, number>();
      const levels = new Map<number, Level>();
      for (const o of kids(num, "lvlOverride")) {
        const ilvl = int(o.attrs.ilvl) ?? 0;
        const start = int(kid(o, "startOverride")?.attrs.val);
        if (start !== undefined) starts.set(ilvl, start);
        const lvl = kid(o, "lvl");
        if (lvl) levels.set(ilvl, this.level(lvl, theme));
      }
      this.nums.set(num.attrs.numId ?? "", { abstractId: kid(num, "abstractNumId")?.attrs.val ?? "", starts, levels });
    }
  }

  private level(lvl: XmlElement, theme: Theme): Level {
    return {
      fmt: kid(lvl, "numFmt")?.attrs.val ?? "decimal",
      text: kid(lvl, "lvlText")?.attrs.val ?? "",
      start: int(kid(lvl, "start")?.attrs.val) ?? 1,
      pPr: readPPr(kid(lvl, "pPr")),
      rPr: readRPr(kid(lvl, "rPr"), theme),
    };
  }

  private levels(a: XmlElement, theme: Theme): Level[] {
    const out: Level[] = [];
    for (const lvl of kids(a, "lvl")) out[int(lvl.attrs.ilvl) ?? 0] = this.level(lvl, theme);
    return out;
  }

  levelOf(numId: string, ilvl: number): Level | undefined {
    const num = this.nums.get(numId);
    if (!num) return undefined;
    return num.levels.get(ilvl) ?? this.abstracts.get(num.abstractId)?.[ilvl];
  }

  /** Advances the counters and returns the list info, or null when the level shows no marker. */
  next(numId: string, ilvl: number): ListInfo | null {
    const num = this.nums.get(numId);
    if (!num || numId === "0") return null;
    const level = this.levelOf(numId, ilvl);
    if (!level || level.fmt === "none") return null;
    const key = num.abstractId;
    let counters = this.counters.get(key) ?? [];
    let instance = this.instances.get(key) ?? 0;
    // A startOverride restarts the list the first time its w:num is used.
    if (num.starts.size && !this.restarted.has(numId)) {
      this.restarted.add(numId);
      if (counters.length) instance++;
      counters = [];
      for (const [l, start] of num.starts) counters[l] = start - 1;
    }
    for (let l = 0; l < ilvl; l++) counters[l] ??= this.levelOf(numId, l)?.start ?? 1;
    counters[ilvl] = (counters[ilvl] ?? (level.start - 1)) + 1;
    counters.length = ilvl + 1;
    this.counters.set(key, counters);
    this.instances.set(key, instance);

    const label = level.text.replace(/%(\d)/g, (_, d: string) => {
      const l = Number(d) - 1;
      const lv = this.levelOf(numId, l);
      return formatNumber(counters[l] ?? lv?.start ?? 1, lv?.fmt ?? "decimal");
    });
    // Children restart under each parent item, so the parent counters are part of the list id.
    const listId = `${key}#${instance}/${counters.slice(0, ilvl).join(".")}`;
    if (level.fmt === "bullet") {
      return { kind: "bullet", format: bulletType(level.text), level: ilvl, listId, label: bulletChar(level.text) };
    }
    return { kind: "number", format: numberType(level.fmt, level.text), level: ilvl, listId, label };
  }
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let out = "";
  for (const [v, s] of table) while (n >= v) ((out += s), (n -= v));
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

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case "lowerRoman":
      return roman(n);
    case "upperRoman":
      return roman(n).toUpperCase();
    case "lowerLetter":
      return letters(n);
    case "upperLetter":
      return letters(n).toUpperCase();
    case "decimalZero":
      return String(n).padStart(2, "0");
    default:
      return String(n);
  }
}

function numberType(fmt: string, lvlText: string): string {
  const body =
    fmt === "lowerRoman" ? "ROMAN_SMALL" : fmt === "upperRoman" ? "ROMAN_BIG" : fmt === "lowerLetter" ? "CHAR_SMALL" : fmt === "upperLetter" ? "CHAR_BIG" : "NUMBER";
  const t = lvlText.trim();
  const tail = /^\(.*\)$/.test(t) ? "D_PARANTHESE" : t.endsWith(")") ? "PARANTHESE" : "DOT";
  return `NUMBER_TYPE_${body}_${tail}`;
}

/** Symbol and Wingdings bullets live in the private use area; map the common ones to what the editor offers. */
function bulletType(lvlText: string): string {
  const c = lvlText.codePointAt(0) ?? 0;
  if (c === 0xf0a7 || c === 0x25aa || c === 0x25a0 || c === 0xf06e) return "BULLET_TYPE_RECTANGLE";
  if (c === 0xf0d8 || c === 0x27a2 || c === 0x25ba || c === 0xf0e8) return "BULLET_TYPE_ARROW";
  if (c === 0xf076 || c === 0x2756 || c === 0x25c6) return "BULLET_TYPE_DIAMOND";
  if (c === 0x25a1 || c === 0xf071) return "BULLET_TYPE_RECTANGLE_D";
  return "BULLET_TYPE_ELLIPSE";
}

function bulletChar(lvlText: string): string {
  const map: Record<string, string> = {
    BULLET_TYPE_RECTANGLE: "■",
    BULLET_TYPE_ARROW: "►",
    BULLET_TYPE_DIAMOND: "◆",
    BULLET_TYPE_RECTANGLE_D: "□",
  };
  return map[bulletType(lvlText)] ?? "•";
}


interface Part {
  path: string;
  rels: Map<string, { target: string; type: string; external: boolean }>;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

function sniffImage(bytes: Uint8Array): ImageData["mime"] {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) return "image/webp";
  return "application/octet-stream";
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function lengthPt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(-?[\d.]+)\s*(pt|in|cm|mm|px|emu)?$/.exec(value.trim());
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  const unit = m[2] ?? "px";
  return unit === "pt" ? v : unit === "in" ? v * 72 : unit === "cm" ? (v / 2.54) * 72 : unit === "mm" ? (v / 25.4) * 72 : unit === "emu" ? v / 12700 : v * 0.75;
}

const SYMBOLS: Record<number, string> = { 0xf0b7: "•", 0xf0a7: "▪", 0xf0fc: "✓", 0xf0d8: "➢", 0xf076: "❖", 0xf06e: "■", 0xf0e8: "➔" };


type Piece = Inline | { type: "break"; kind: "line" | "page" };

interface FieldState {
  instr: string;
  phase: "instr" | "result";
  code: string;
}

interface ParaMeta {
  styleId: string;
  contextual: boolean;
}

class Reader {
  notes = new Set<DocxNote>();
  private meta = new WeakMap<Paragraph, ParaMeta>();
  private footnoteBlocks: Block[] = [];
  private footnoteNumbers = new Map<string, number>();
  private noteParts = new Map<string, Map<string, XmlElement>>();
  private part!: Part;
  private sectPrs: XmlElement[] = [];
  private currentNote: number | null = null;

  constructor(
    private zip: JSZip,
    private styles: Styles,
    private numbering: Numbering,
    private theme: Theme,
    private images: Map<string, ImageData | null>,
    private lang: string,
  ) {}

  async prepare(main: Part): Promise<void> {
    // Footnote and endnote bodies are read up front so references can pull them in document order.
    for (const [type, element] of [["footnotes", "footnote"], ["endnotes", "endnote"]] as const) {
      const rel = [...main.rels.values()].find((r) => r.type.endsWith(`/${type}`));
      if (!rel) continue;
      const path = resolvePath(main.path, rel.target);
      const root = await loadXml(this.zip, path);
      if (!root) continue;
      const map = new Map<string, XmlElement>();
      for (const n of kids(root, element)) if (!n.attrs.type || n.attrs.type === "normal") map.set(n.attrs.id ?? "", n);
      this.noteParts.set(element, map);
      await this.loadImages({ path, rels: await loadRels(this.zip, path) });
    }
  }

  async loadImages(part: Part): Promise<void> {
    for (const [id, rel] of part.rels) {
      if (rel.external || !rel.type.endsWith("/image")) continue;
      const key = `${part.path}#${id}`;
      if (this.images.has(key)) continue;
      const file = this.zip.file(resolvePath(part.path, rel.target));
      if (!file) {
        this.images.set(key, null);
        continue;
      }
      const bytes = await file.async("uint8array");
      this.images.set(key, { base64: toBase64(bytes), mime: sniffImage(bytes) });
    }
  }

  setPart(part: Part): void {
    this.part = part;
  }

  readBody(body: XmlElement): Block[] {
    this.sectPrs = [];
    for (const p of kids(body, "p")) {
      const s = kid(kid(p, "pPr"), "sectPr");
      if (s) this.sectPrs.push(s);
    }
    const last = kid(body, "sectPr");
    if (last) this.sectPrs.push(last);
    if (this.sectPrs.length > 1) this.notes.add("sections");
    const blocks = this.blocks(body);
    if (this.footnoteBlocks.length) {
      blocks.push(this.plain("______________________", 10));
      blocks.push(...this.footnoteBlocks);
    }
    this.applyContextualSpacing(blocks);
    return blocks;
  }

  private plain(textValue: string, size: number): Paragraph {
    const style = { ...toRunStyle(this.styles.paragraph(undefined).rPr), size };
    return {
      type: "paragraph",
      align: "left",
      leftIndent: 0,
      rightIndent: 0,
      firstLineIndent: 0,
      lineSpacing: 0,
      spaceAbove: 0,
      spaceBelow: 0,
      tabStops: null,
      list: null,
      inlines: [{ type: "text", text: textValue, style }],
      markStyle: style,
    };
  }

  blocks(container: XmlElement): Block[] {
    const out: Block[] = [];
    for (const el of kids(container)) {
      switch (el.name) {
        case "p":
          this.paragraph(el, out);
          break;
        case "tbl":
          out.push(this.table(el));
          break;
        case "sdt":
          out.push(...this.blocks(kid(el, "sdtContent") ?? el));
          break;
        case "customXml":
        case "ins":
        case "moveTo":
          out.push(...this.blocks(el));
          break;
        case "altChunk":
          this.notes.add("embedded");
          break;
        default:
          break;
      }
    }
    return out;
  }

  private applyContextualSpacing(blocks: Block[]): void {
    let prev: Paragraph | null = null;
    for (const b of blocks) {
      if (b.type !== "paragraph") {
        if (b.type === "table") for (const r of b.rows) for (const c of r.cells) this.applyContextualSpacing(c.blocks);
        prev = null;
        continue;
      }
      const m = this.meta.get(b);
      const pm = prev ? this.meta.get(prev) : undefined;
      if (prev && m && pm && m.styleId === pm.styleId) {
        if (m.contextual) b.spaceAbove = 0;
        if (pm.contextual) prev.spaceBelow = 0;
      }
      prev = b;
    }
  }

  private paragraph(p: XmlElement, out: Block[]): void {
    const pPrEl = kid(p, "pPr");
    const styleId = kid(pPrEl, "pStyle")?.attrs.val ?? this.styles.defaultParagraphStyle ?? "";
    const style = this.styles.paragraph(kid(pPrEl, "pStyle")?.attrs.val);
    let pPr = mergeP(style.pPr, readPPr(pPrEl));
    const markR = mergeR(style.rPr, readRPr(kid(pPrEl, "rPr"), this.theme));

    let list: ListInfo | null = null;
    if (pPr.numId !== undefined) {
      const numId = pPr.numId;
      const ilvl = pPr.ilvl ?? 0;
      const level = this.numbering.levelOf(numId, ilvl);
      // The level's indent applies unless the paragraph itself sets one.
      if (level) pPr = mergeP(mergeP(style.pPr, level.pPr), readPPr(pPrEl));
      list = this.numbering.next(numId, ilvl);
    }

    const pieces: Piece[] = [];
    const fields: FieldState[] = [];
    const extra: Block[] = [];
    this.inlines(p, style.rPr, pieces, fields, extra);

    const markStyle = toRunStyle(markR);
    const size = markStyle.size;
    const lineSpacing =
      pPr.line === undefined
        ? 0
        : pPr.lineRule === "auto" || !pPr.lineRule
          ? Math.max(0, pPr.line / 240 - 1)
          : Math.max(0, twip(pPr.line) / (size * 1.15) - 1);
    const firstLine = pPr.hanging ? -pPr.hanging : (pPr.firstLine ?? 0);
    const left = pPr.left ?? 0;

    const shell = (): Paragraph => ({
      type: "paragraph",
      align: pPr.align ?? "left",
      leftIndent: left,
      rightIndent: pPr.right ?? 0,
      firstLineIndent: firstLine,
      lineSpacing: Math.round(lineSpacing * 100) / 100,
      spaceAbove: pPr.before ?? 0,
      spaceBelow: pPr.after ?? 0,
      tabStops: this.tabStops(pPr, left, firstLine, pieces.some((x) => x.type === "tab")),
      list: null,
      inlines: [],
      markStyle,
    });

    if (pPr.pageBreakBefore) out.push({ type: "pageBreak" });

    // Line and page breaks inside a paragraph split it, since a UDF paragraph cannot hold either.
    const parts: { inlines: Inline[]; after: "line" | "page" | null }[] = [{ inlines: [], after: null }];
    for (const piece of pieces) {
      if (piece.type === "break") {
        parts[parts.length - 1].after = piece.kind;
        parts.push({ inlines: [], after: null });
      } else parts[parts.length - 1].inlines.push(piece);
    }
    parts.forEach((part, i) => {
      const isFirst = i === 0;
      const isLast = i === parts.length - 1;
      const prevBreak = i > 0 ? parts[i - 1].after : null;
      const empty = part.inlines.length === 0;
      // A paragraph that only holds a page break becomes just the break.
      const skip = empty && ((isFirst && part.after === "page") || (prevBreak === "page" && isLast && parts.length > 1));
      if (!skip) {
        const para = shell();
        para.inlines = part.inlines;
        if (isFirst) para.list = list;
        else {
          para.firstLineIndent = 0;
          if (prevBreak === "line") para.spaceAbove = 0;
        }
        if (part.after === "line") para.spaceBelow = 0;
        if (!isFirst && list) para.leftIndent = left;
        this.meta.set(para, { styleId, contextual: !!pPr.contextual });
        out.push(para);
      }
      if (part.after === "page") out.push({ type: "pageBreak" });
    });
    out.push(...extra);

    const sect = kid(pPrEl, "sectPr");
    if (sect) {
      const index = this.sectPrs.indexOf(sect);
      const next = this.sectPrs[index + 1];
      const kind = kid(next, "type")?.attrs.val ?? "nextPage";
      if (next && kind !== "continuous" && kind !== "nextColumn") out.push({ type: "pageBreak" });
    }
  }

  /** Word measures stops from the margin and adds an implicit stop at a hanging indent; the default grid fills the rest. */
  private tabStops(pPr: PProps, left: number, firstLine: number, hasTab: boolean): TabStop[] | null {
    const stops: TabStop[] = [];
    for (const t of pPr.tabs ?? []) {
      if (t.val === "clear" || t.val === "bar" || t.val === "num") continue;
      stops.push({
        position: t.pos,
        align: t.val === "right" || t.val === "end" ? "right" : t.val === "center" ? "center" : t.val === "decimal" ? "decimal" : "left",
        leader: t.leader === "dot" || t.leader === "middleDot" ? "dots" : t.leader === "hyphen" ? "hyphens" : t.leader === "underscore" || t.leader === "heavy" ? "underline" : "none",
      });
    }
    if (!hasTab) return stops.length ? stops.sort((a, b) => a.position - b.position) : null;
    if (firstLine < 0 && !stops.some((s) => s.position > left + firstLine + 0.5 && s.position < left + 0.5)) {
      stops.push({ position: left, align: "left", leader: "none" });
    }
    stops.sort((a, b) => a.position - b.position);
    const last = stops.length ? stops[stops.length - 1].position : 0;
    const step = this.defaultTab;
    // The editor's own default grid is 72pt, so Word's 36pt grid is written out up to a page width.
    for (let pos = (Math.floor(Math.max(last, left + Math.min(0, firstLine)) / step) + 1) * step; pos < 560; pos += step) {
      stops.push({ position: pos, align: "left", leader: "none" });
    }
    return stops.length ? stops : null;
  }

  defaultTab = 36;

  private runStyle(paraR: RProps, rPrEl: XmlElement | undefined): RProps {
    const charStyle = this.styles.character(kid(rPrEl, "rStyle")?.attrs.val);
    return mergeR(mergeR(paraR, charStyle), readRPr(rPrEl, this.theme));
  }

  /** Pieces before this index stay apart, so a field result never merges into the text before it. */
  private floor = new WeakMap<Piece[], number>();

  private pushText(out: Piece[], value: string, r: RProps, field?: string): void {
    if (!value) return;
    const style = toRunStyle(r);
    const shown = r.caps ? value.toLocaleUpperCase(this.lang) : value;
    const last = out.length > (this.floor.get(out) ?? 0) ? out[out.length - 1] : undefined;
    if (!field && last && last.type === "text" && !last.field && sameStyle(last.style, style)) last.text += shown;
    else out.push(field ? { type: "text", text: shown, style, field } : { type: "text", text: shown, style });
  }

  private inlines(container: XmlElement, paraR: RProps, out: Piece[], fields: FieldState[], extra: Block[]): void {
    for (const el of kids(container)) {
      switch (el.name) {
        case "r":
          this.run(el, paraR, out, fields, extra);
          break;
        case "hyperlink":
        case "smartTag":
        case "customXml":
        case "ins":
        case "moveTo":
        case "dir":
        case "bdo":
          this.inlines(el, paraR, out, fields, extra);
          break;
        case "sdt":
          this.inlines(kid(el, "sdtContent") ?? el, paraR, out, fields, extra);
          break;
        case "fldSimple": {
          const code = (el.attrs.instr ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
          const before = out.length;
          this.floor.set(out, before);
          this.inlines(el, paraR, out, fields, extra);
          if (code === "PAGE" || code === "NUMPAGES" || code === "SECTIONPAGES") this.markField(out, before, code);
          break;
        }
        case "oMath":
        case "oMathPara":
          for (const t of findAll(el, "t")) this.pushText(out, text(t), paraR);
          break;
        case "AlternateContent": {
          const choice = kid(el, "Choice") ?? kid(el, "Fallback");
          if (choice) this.inlines(choice, paraR, out, fields, extra);
          break;
        }
        default:
          break;
      }
    }
  }

  private markField(out: Piece[], from: number, code: string): void {
    const shown = out
      .slice(from)
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
    const style = out.slice(from).find((p): p is TextRun => p.type === "text")?.style ?? toRunStyle(this.styles.paragraph(undefined).rPr);
    out.splice(from, out.length - from, { type: "text", text: shown || "1", style, field: code === "PAGE" ? "PAGE" : "NUMPAGES" });
  }

  private run(r: XmlElement, paraR: RProps, out: Piece[], fields: FieldState[], extra: Block[]): void {
    const props = this.runStyle(paraR, kid(r, "rPr"));
    if (props.vanish) return;
    this.runChildren(r, props, out, fields, extra);
  }

  private runChildren(r: XmlElement, props: RProps, out: Piece[], fields: FieldState[], extra: Block[]): void {
    for (const el of kids(r)) {
      const field = fields[fields.length - 1];
      if (el.name === "fldChar") {
        const kind = el.attrs.fldCharType;
        if (kind === "begin") fields.push({ instr: "", phase: "instr", code: "" });
        else if (kind === "separate" && field) {
          field.phase = "result";
          field.code = field.instr.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
          (field as FieldState & { start?: number }).start = out.length;
          this.floor.set(out, out.length);
        } else if (kind === "end" && field) {
          fields.pop();
          const start = (field as FieldState & { start?: number }).start;
          if (start !== undefined && (field.code === "PAGE" || field.code === "NUMPAGES" || field.code === "SECTIONPAGES")) this.markField(out, start, field.code);
        }
        continue;
      }
      if (el.name === "instrText") {
        if (field) field.instr += text(el);
        continue;
      }
      if (fields.some((f) => f.phase === "instr")) continue;
      switch (el.name) {
        case "t":
          this.pushText(out, text(el), props);
          break;
        case "tab":
        case "ptab":
          out.push({ type: "tab", style: toRunStyle(props) });
          break;
        case "br": {
          const type = el.attrs.type;
          out.push({ type: "break", kind: type === "page" ? "page" : "line" });
          break;
        }
        case "cr":
          out.push({ type: "break", kind: "line" });
          break;
        case "noBreakHyphen":
          this.pushText(out, "-", props);
          break;
        case "sym": {
          const code = parseInt(el.attrs.char ?? "", 16);
          const ch = SYMBOLS[code] ?? (code >= 0xf020 && code < 0xf080 && /symbol/i.test(el.attrs.font ?? "") ? String.fromCharCode(code - 0xf000) : "");
          this.pushText(out, ch, props);
          break;
        }
        case "drawing":
          this.drawing(el, out, extra);
          break;
        case "pict":
        case "object":
          this.vml(el, out, extra);
          break;
        case "AlternateContent": {
          const choice = kid(el, "Choice") ?? kid(el, "Fallback");
          if (choice) this.runChildren(choice, props, out, fields, extra);
          break;
        }
        case "footnoteReference":
        case "endnoteReference":
          this.noteReference(el, props, out);
          break;
        case "footnoteRef":
        case "endnoteRef":
          if (this.currentNote !== null) this.pushText(out, String(this.currentNote), { ...props, vert: "superscript" });
          break;
        default:
          break;
      }
    }
  }

  private noteReference(el: XmlElement, props: RProps, out: Piece[]): void {
    const kind = el.name === "footnoteReference" ? "footnote" : "endnote";
    const body = this.noteParts.get(kind)?.get(el.attrs.id ?? "");
    if (!body) return;
    const key = `${kind}:${el.attrs.id}`;
    let number = this.footnoteNumbers.get(key);
    if (number === undefined) {
      number = this.footnoteNumbers.size + 1;
      this.footnoteNumbers.set(key, number);
      this.notes.add("footnotes");
      const saved = this.currentNote;
      this.currentNote = number;
      const blocks = this.blocks(body);
      this.currentNote = saved;
      this.footnoteBlocks.push(...blocks);
    }
    this.pushText(out, String(number), { ...props, vert: "superscript" });
  }

  private image(id: string | undefined): ImageData | null {
    if (!id) return null;
    const img = this.images.get(`${this.part.path}#${id}`) ?? null;
    if (img && img.mime === "application/octet-stream") {
      this.notes.add("image-format");
      return null;
    }
    return img;
  }

  private drawing(el: XmlElement, out: Piece[], extra: Block[]): void {
    const holder = kid(el, "inline") ?? kid(el, "anchor");
    if (!holder) return;
    const extent = kid(holder, "extent");
    const width = (int(extent?.attrs.cx) ?? 0) / 12700;
    const height = (int(extent?.attrs.cy) ?? 0) / 12700;
    const blip = find(holder, "blip");
    const txbx = find(holder, "txbxContent");
    if (blip) {
      const image = this.image(blip.attrs.rembed);
      if (image) out.push({ type: "image", image, width, height });
    }
    if (txbx) {
      this.notes.add("textbox");
      extra.push(...this.blocks(txbx));
    }
    if (!blip && !txbx) {
      const uri = find(holder, "graphicData")?.attrs.uri ?? "";
      this.notes.add(uri.includes("chart") ? "chart" : "shape");
    }
  }

  private vml(el: XmlElement, out: Piece[], extra: Block[]): void {
    const data = find(el, "imagedata");
    const shape = find(el, "shape") ?? find(el, "rect");
    const style = shape?.attrs.style ?? "";
    const dim = (name: string) => lengthPt(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1]);
    if (data) {
      const image = this.image(data.attrs.rid ?? data.attrs.rpict ?? data.attrs.relid);
      if (image) out.push({ type: "image", image, width: dim("width") ?? 100, height: dim("height") ?? 100 });
    }
    const txbx = find(el, "txbxContent");
    if (txbx) {
      this.notes.add("textbox");
      extra.push(...this.blocks(txbx));
    }
    if (!data && !txbx) this.notes.add(el.name === "object" ? "embedded" : "shape");
  }

  private table(tbl: XmlElement): Table {
    const tblPr = kid(tbl, "tblPr");
    const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => twip(int(g.attrs.w) ?? 0));
    const tableBorders = kid(tblPr, "tblBorders") ?? this.styles.tableBorders(kid(tblPr, "tblStyle")?.attrs.val);
    const rowEls = kids(tbl, "tr").concat(kids(tbl, "sdt").flatMap((s) => kids(kid(s, "sdtContent"), "tr")));

    interface Slot {
      cell: TableCell;
      col: number;
      span: number;
      merge: string | undefined;
      tcBorders: XmlElement | undefined;
    }
    const rows: Slot[][] = [];
    const heights: number[] = [];
    for (const tr of rowEls) {
      const trPr = kid(tr, "trPr");
      heights.push(twip(int(kid(trPr, "trHeight")?.attrs.val) ?? 0));
      let col = int(kid(trPr, "gridBefore")?.attrs.val) ?? 0;
      const slots: Slot[] = [];
      if (col > 0) {
        slots.push({ cell: emptyCell(col), col: 0, span: col, merge: undefined, tcBorders: undefined });
      }
      const cellEls = kids(tr).flatMap((c) => (c.name === "tc" ? [c] : c.name === "sdt" || c.name === "customXml" ? kids(kid(c, "sdtContent") ?? c, "tc") : []));
      for (const tc of cellEls) {
        const tcPr = kid(tc, "tcPr");
        const span = Math.max(1, int(kid(tcPr, "gridSpan")?.attrs.val) ?? 1);
        const vMerge = kid(tcPr, "vMerge");
        const fill = hex(kid(tcPr, "shd")?.attrs.fill) ?? null;
        const valign = kid(tcPr, "vAlign")?.attrs.val;
        const cell: TableCell = {
          colspan: span,
          rowspan: 1,
          verticalAlign: valign === "center" ? "middle" : valign === "bottom" ? "bottom" : "top",
          fill: fill && fill !== "#ffffff" ? fill : null,
          borders: { top: null, right: null, bottom: null, left: null },
          blocks: this.blocks(tc),
        };
        slots.push({ cell, col, span, merge: vMerge ? (vMerge.attrs.val ?? "continue") : undefined, tcBorders: kid(tcPr, "tcBorders") });
        col += span;
      }
      rows.push(slots);
    }

    const columns = Math.max(grid.length, ...rows.map((r) => r.reduce((s, x) => s + x.span, 0)), 1);
    const rowCount = rows.length;
    const out: TableRow[] = [];
    rows.forEach((slots, r) => {
      const cells: TableCell[] = [];
      for (const slot of slots) {
        if (slot.merge === "continue") continue;
        if (slot.merge === "restart") {
          let span = 1;
          for (let rr = r + 1; rr < rowCount; rr++) {
            const below = rows[rr].find((s) => s.col === slot.col);
            if (below?.merge !== "continue") break;
            span++;
          }
          slot.cell.rowspan = span;
        }
        const lastRow = r + slot.cell.rowspan - 1;
        const side = (name: string, alt: string | null, outer: boolean, inside: string) =>
          borderOf(kid(slot.tcBorders, name) ?? (alt ? kid(slot.tcBorders, alt) : undefined)) ??
          borderOf(kid(tableBorders, outer ? name : inside) ?? (outer && alt ? kid(tableBorders, alt) : undefined));
        slot.cell.borders = {
          top: side("top", null, r === 0, "insideH"),
          bottom: side("bottom", null, lastRow === rowCount - 1, "insideH"),
          left: side("left", "start", slot.col === 0, "insideV"),
          right: side("right", "end", slot.col + slot.span >= columns, "insideV"),
        };
        if (slot.cell.blocks.length === 0) slot.cell.blocks = [];
        cells.push(slot.cell);
      }
      out.push({ minHeight: heights[r] ?? 0, cells });
    });
    const widths = grid.length ? grid : Array.from({ length: columns }, () => 0);
    return { type: "table", columnWidths: widths, rows: out };
  }

  sectionFrom(root: XmlElement, part: Part, top: boolean): Section {
    const saved = this.part;
    this.setPart(part);
    const blocks = this.blocks(root);
    this.setPart(saved);
    this.applyContextualSpacing(blocks);
    const pageNumber = extractPageNumber(blocks, top);
    return { blocks, pageNumber, startPage: 1, stopPage: null };
  }
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return (
    a.font === b.font &&
    a.size === b.size &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.superscript === b.superscript &&
    a.subscript === b.subscript &&
    a.color === b.color &&
    a.background === b.background
  );
}

function emptyCell(span: number): TableCell {
  return { colspan: span, rowspan: 1, verticalAlign: "top", fill: null, borders: { top: null, right: null, bottom: null, left: null }, blocks: [] };
}

function borderOf(el: XmlElement | undefined): Border | null {
  if (!el) return null;
  const val = el.attrs.val ?? "single";
  if (val === "nil" || val === "none") return null;
  const color = hex(el.attrs.color) ?? null;
  return {
    width: Math.max(0.25, (int(el.attrs.sz) ?? 4) / 8),
    color: color ?? "#000000",
    style: val === "double" ? "double" : val.startsWith("dot") && !val.startsWith("dotDash") ? "dotted" : /dash/i.test(val) ? "dashed" : "solid",
  };
}

/** Turns a header or footer paragraph holding a PAGE field into the editor's own page number. */
function extractPageNumber(blocks: Block[], top: boolean): PageNumber | null {
  for (let i = 0; i < blocks.length; i++) {
    const p = blocks[i];
    if (p.type !== "paragraph") continue;
    const at = p.inlines.findIndex((x) => x.type === "text" && x.field === "PAGE");
    if (at === -1) continue;
    const page = p.inlines[at] as TextRun;
    // Text after the last tab before the field is the prefix; what precedes that tab stays as a paragraph.
    let cut = at - 1;
    while (cut >= 0 && p.inlines[cut].type !== "tab") cut--;
    const before = p.inlines.slice(cut + 1, at);
    const after = p.inlines.slice(at + 1);
    const total = after.findIndex((x) => x.type === "text" && (x.field === "NUMPAGES" || x.field === "SECTIONPAGES"));
    const textOf = (xs: Inline[]) => xs.map((x) => (x.type === "text" ? x.text : "")).join("");
    let align: PageNumber["align"] = p.align === "justify" ? "left" : p.align;
    if (cut >= 0) {
      const stop = p.tabStops?.find((s) => s.align !== "left" && s.leader === "none") ?? null;
      align = stop?.align === "center" ? "center" : "right";
    }
    const spec: PageNumber = {
      top: top || (i === 0 && blocks.length > 1),
      align,
      withTotal: total !== -1,
      skipFirst: false,
      skipSingle: false,
      prefix: textOf(before),
      suffix: total === -1 ? textOf(after) : textOf(after.slice(total + 1)),
      separator: total === -1 ? "/" : textOf(after.slice(0, total)) || "/",
      startNumber: 1,
      style: page.style,
    };
    const rest = p.inlines.slice(0, Math.max(0, cut));
    if (rest.some((x) => x.type !== "tab" && (x.type !== "text" || x.text.trim()))) p.inlines = rest;
    else blocks.splice(i, 1);
    return spec;
  }
  return null;
}

async function loadXml(zip: JSZip, path: string): Promise<XmlElement | undefined> {
  const file = zip.file(path);
  if (!file) return undefined;
  const root = stripPrefixes(parseXml(await file.async("string")));
  return kids(root)[0];
}

async function loadRels(zip: JSZip, partPath: string): Promise<Part["rels"]> {
  const dir = partPath.split("/").slice(0, -1).join("/");
  const name = partPath.split("/").pop();
  const rels = new Map<string, { target: string; type: string; external: boolean }>();
  const root = await loadXml(zip, `${dir ? dir + "/" : ""}_rels/${name}.rels`);
  for (const r of kids(root, "Relationship")) {
    rels.set(r.attrs.Id ?? "", { target: r.attrs.Target ?? "", type: r.attrs.Type ?? "", external: r.attrs.TargetMode === "External" });
  }
  return rels;
}

const PAGE_DEFAULT: PageSetup = {
  mediaSizeName: "1",
  width: 595.28,
  height: 841.89,
  landscape: false,
  marginLeft: 72,
  marginRight: 72,
  marginTop: 72,
  marginBottom: 72,
  headerOffset: 36,
  footerOffset: 36,
};

function readPage(sectPr: XmlElement | undefined): PageSetup {
  const page = { ...PAGE_DEFAULT };
  const sz = kid(sectPr, "pgSz");
  if (sz) {
    const w = twip(int(sz.attrs.w) ?? 11906);
    const h = twip(int(sz.attrs.h) ?? 16838);
    page.width = w;
    page.height = h;
    page.landscape = sz.attrs.orient === "landscape" || w > h;
  }
  const mar = kid(sectPr, "pgMar");
  if (mar) {
    const a = mar.attrs;
    page.marginTop = Math.abs(twip(int(a.top) ?? 1440));
    page.marginBottom = Math.abs(twip(int(a.bottom) ?? 1440));
    page.marginLeft = twip((int(a.left) ?? 1440) + (int(a.gutter) ?? 0));
    page.marginRight = twip(int(a.right) ?? 1440);
    page.headerOffset = twip(int(a.header) ?? 720);
    page.footerOffset = twip(int(a.footer) ?? 720);
  }
  return page;
}

function sniffContainer(bytes: Uint8Array): DocxErrorCode | null {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    // Password-protected .docx files are OLE containers too; they carry an EncryptionInfo stream.
    const probe = new TextDecoder("utf-16le").decode(bytes.subarray(0, Math.min(bytes.length, 1 << 20)));
    return probe.includes("EncryptionInfo") ? "encrypted" : "doc-binary";
  }
  if (bytes[0] === 0x7b && bytes[1] === 0x5c && bytes[2] === 0x72 && bytes[3] === 0x74) return "rtf";
  return null;
}

export async function readDocx(data: Uint8Array | ArrayBuffer): Promise<DocxResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const container = sniffContainer(bytes);
  if (container) throw new DocxError(container, `Unsupported container: ${container}`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    throw new DocxError("not-zip", `Not a .docx archive: ${(e as Error).message}`);
  }
  const rootRels = await loadRels(zip, "");
  const mainRel = [...rootRels.values()].find((r) => REL_OFFICE_DOCUMENT.test(r.type));
  const mainPath = mainRel ? resolvePath("", mainRel.target) : "word/document.xml";
  const documentRoot = await loadXml(zip, mainPath);
  const body = kid(documentRoot, "body");
  if (!documentRoot || documentRoot.name !== "document" || !body) throw new DocxError("not-docx", "word/document.xml is missing");

  const main: Part = { path: mainPath, rels: await loadRels(zip, mainPath) };
  const relOf = (suffix: string) => [...main.rels.values()].find((r) => r.type.endsWith(suffix));
  const partXml = async (suffix: string) => {
    const rel = relOf(suffix);
    return rel ? loadXml(zip, resolvePath(mainPath, rel.target)) : undefined;
  };

  const themeRoot = await partXml("/theme");
  const scheme = themeRoot ? find(themeRoot, "fontScheme") : undefined;
  const theme: Theme = {
    major: find(kid(scheme, "majorFont") ?? { name: "", attrs: {}, children: [] }, "latin")?.attrs.typeface || "Calibri Light",
    minor: find(kid(scheme, "minorFont") ?? { name: "", attrs: {}, children: [] }, "latin")?.attrs.typeface || "Calibri",
  };
  const stylesRoot = await partXml("/styles");
  const styles = new Styles(stylesRoot, theme);
  const numbering = new Numbering(await partXml("/numbering"), theme);
  const settings = await partXml("/settings");
  const lang = kid(kid(kid(kid(stylesRoot, "docDefaults"), "rPrDefault"), "rPr"), "lang")?.attrs.val ?? "tr-TR";

  const images = new Map<string, ImageData | null>();
  const reader = new Reader(zip, styles, numbering, theme, images, lang.toLowerCase().startsWith("tr") ? "tr" : "en");
  const defaultTab = int(kid(settings, "defaultTabStop")?.attrs.val);
  if (defaultTab && defaultTab > 0) reader.defaultTab = twip(defaultTab);
  if (relOf("/comments")) reader.notes.add("comments");

  await reader.loadImages(main);
  await reader.prepare(main);
  reader.setPart(main);
  const blocks = reader.readBody(body);

  const sectPr = kid(body, "sectPr");
  const page = readPage(sectPr);
  if (sectPr && !kid(sectPr, "pgSz")) page.mediaSizeName = "1";
  const known: [number, number, string][] = [
    [595.28, 841.89, "1"],
    [419.53, 595.28, "2"],
    [612, 792, "3"],
    [515.91, 728.5, "4"],
    [612, 1008, "5"],
    [522, 756, "6"],
  ];
  const [pw, ph] = page.width <= page.height ? [page.width, page.height] : [page.height, page.width];
  const media = known.find(([w, h]) => Math.abs(w - pw) < 6 && Math.abs(h - ph) < 6);
  if (media) {
    page.mediaSizeName = media[2];
    [page.width, page.height] = page.landscape ? [media[1], media[0]] : [media[0], media[1]];
  }
  else reader.notes.add("page-size");

  const titlePage = onOff(kid(sectPr, "titlePg")) ?? false;
  const startNumber = int(kid(sectPr, "pgNumType")?.attrs.start) ?? 1;
  const section = async (kind: "headerReference" | "footerReference"): Promise<Section | null> => {
    const refs = kids(sectPr, kind);
    const ref = refs.find((r) => (r.attrs.type ?? "default") === "default");
    const first = refs.find((r) => r.attrs.type === "first");
    const load = async (refEl: XmlElement | undefined): Promise<Section | null> => {
      const rel = refEl ? main.rels.get(refEl.attrs.rid ?? "") : undefined;
      if (!rel) return null;
      const path = resolvePath(mainPath, rel.target);
      const root = await loadXml(zip, path);
      if (!root) return null;
      const part: Part = { path, rels: await loadRels(zip, path) };
      await reader.loadImages(part);
      return reader.sectionFrom(root, part, kind === "headerReference");
    };
    const main_ = await load(ref);
    if (!main_) return null;
    if (titlePage) {
      const firstSection = await load(first);
      const firstEmpty = !firstSection || (firstSection.blocks.every((b) => b.type === "paragraph" && b.inlines.length === 0) && !firstSection.pageNumber);
      if (firstEmpty) main_.startPage = 2;
    }
    if (main_.pageNumber) main_.pageNumber.startNumber = startNumber;
    const hasContent = main_.pageNumber || main_.blocks.some((b) => b.type !== "paragraph" || b.inlines.length > 0);
    return hasContent ? main_ : null;
  };
  const header = await section("headerReference");
  const footer = await section("footerReference");

  const doc: UdfDocument = {
    formatId: "1.8",
    page,
    header,
    footer,
    body: blocks.length ? blocks : [emptyParagraph(styles)],
    background: null,
    text: "",
    extraFiles: [],
    signed: false,
    unknownElements: [],
  };
  return { doc, notes: [...reader.notes] };
}

function emptyParagraph(styles: Styles): Paragraph {
  const markStyle = toRunStyle(styles.paragraph(undefined).rPr);
  return {
    type: "paragraph",
    align: "left",
    leftIndent: 0,
    rightIndent: 0,
    firstLineIndent: 0,
    lineSpacing: 0,
    spaceAbove: 0,
    spaceBelow: 0,
    tabStops: null,
    list: null,
    inlines: [],
    markStyle,
  };
}
