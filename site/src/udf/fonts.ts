import metricsData from "./font-metrics.json";
import type { RunStyle } from "./model.js";

/** Metric-compatible stand-ins: Tinos for Times New Roman, Arimo for Arial, Cousine for Courier New. */
export type FontFamily = "Tinos" | "Arimo" | "Cousine";

export const FONT_FAMILIES: FontFamily[] = ["Tinos", "Arimo", "Cousine"];

const SANS = /arial|helvet|sans|dialog|tahoma|verdana|calibri|segoe|trebuchet|arimo|liberation sans|roboto|open sans|lucida/i;
const MONO = /courier|mono|consol|cousine|typewriter/i;

export function fontFamilyFor(name: string): FontFamily {
  if (MONO.test(name)) return "Cousine";
  // "Microsoft Sans Serif" and "Dialog" are sans; plain "Serif" falls through to Tinos.
  if (SANS.test(name) && !/^serif$/i.test(name)) return "Arimo";
  return "Tinos";
}

export function fontFileName(family: FontFamily, bold: boolean, italic: boolean): string {
  const variant = bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular";
  return `${family}-${variant}`;
}

interface FontMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
  widths: number[][];
}

const tables = new Map<string, { metrics: FontMetrics; widths: Map<number, number> }>();

function table(file: string) {
  let entry = tables.get(file);
  if (!entry) {
    const metrics = (metricsData as Record<string, FontMetrics>)[file];
    const widths = new Map<number, number>();
    for (const [start, ...ws] of metrics.widths) ws.forEach((w, i) => widths.set(start + i, w));
    entry = { metrics, widths };
    tables.set(file, entry);
  }
  return entry;
}

export function fileForStyle(style: Pick<RunStyle, "font" | "bold" | "italic">): string {
  return fontFileName(fontFamilyFor(style.font), style.bold, style.italic);
}

/** Advance width in points, without kerning. */
export function measureText(text: string, style: Pick<RunStyle, "font" | "bold" | "italic" | "size">): number {
  const { widths } = table(fileForStyle(style));
  let units = 0;
  for (const ch of text) units += widths.get(ch.codePointAt(0)!) ?? 500;
  return (units / 1000) * style.size;
}

/** Height of one line as pdfkit computes it: ascent, descent and line gap. */
export function lineHeightOf(style: Pick<RunStyle, "font" | "bold" | "italic" | "size">): number {
  const { metrics } = table(fileForStyle(style));
  return ((metrics.ascent - metrics.descent + metrics.lineGap) / 1000) * style.size;
}

export function ascentOf(style: Pick<RunStyle, "font" | "bold" | "italic" | "size">): number {
  return (table(fileForStyle(style)).metrics.ascent / 1000) * style.size;
}
