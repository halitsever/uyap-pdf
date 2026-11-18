/**
 * Rebuilds src/udf/fonts/*.woff and src/udf/font-metrics.json from the google/fonts sources.
 * Usage: npm i --no-save subset-font@2 fontkit@2 && node scripts/subset-fonts.mjs <dir with Tinos-*.ttf, Arimo[wght].ttf, Arimo-Italic[wght].ttf, Cousine-*.ttf>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import subsetFont from "subset-font";
import * as fontkit from "fontkit";

const src = process.argv[2];
if (!src) throw new Error("pass the directory holding the source TTF files");
const out = new URL("../src/udf/fonts/", import.meta.url);

// Latin with Turkish, Greek, basic Cyrillic and the punctuation, currency and symbol blocks legal texts use.
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0x24f],
  [0x2b0, 0x36f],
  [0x370, 0x3ff],
  [0x400, 0x45f],
  [0x1e00, 0x1eff],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
  [0x2100, 0x218f],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0x2500, 0x25ff],
  [0xfb01, 0xfb02],
];
let text = "";
for (const [a, b] of RANGES) for (let c = a; c <= b; c++) text += String.fromCodePoint(c);

const JOBS = [
  ["Tinos-Regular", "Tinos-Regular.ttf"],
  ["Tinos-Bold", "Tinos-Bold.ttf"],
  ["Tinos-Italic", "Tinos-Italic.ttf"],
  ["Tinos-BoldItalic", "Tinos-BoldItalic.ttf"],
  ["Arimo-Regular", "Arimo[wght].ttf", { wght: 400 }],
  ["Arimo-Bold", "Arimo[wght].ttf", { wght: 700 }],
  ["Arimo-Italic", "Arimo-Italic[wght].ttf", { wght: 400 }],
  ["Arimo-BoldItalic", "Arimo-Italic[wght].ttf", { wght: 700 }],
  ["Cousine-Regular", "Cousine-Regular.ttf"],
  ["Cousine-Bold", "Cousine-Bold.ttf"],
  ["Cousine-Italic", "Cousine-Italic.ttf"],
  ["Cousine-BoldItalic", "Cousine-BoldItalic.ttf"],
];

const metrics = {};
for (const [name, file, axes] of JOBS) {
  // WOFF 1, because fontkit cannot subset composite glyphs out of WOFF2 when pdfkit embeds them.
  const woff = await subsetFont(readFileSync(join(src, file)), text, { targetFormat: "woff", variationAxes: axes, noHinting: true });
  writeFileSync(new URL(`${name}.woff`, out), woff);
  const font = fontkit.create(woff);
  const ranges = [];
  let current = null;
  for (const cp of [...font.characterSet].sort((a, b) => a - b)) {
    const width = Math.round((font.glyphForCodePoint(cp).advanceWidth / font.unitsPerEm) * 1000);
    if (current && cp === current[0] + current.length - 1) current.push(width);
    else ranges.push((current = [cp, width]));
  }
  metrics[name] = {
    ascent: Math.round((font.ascent / font.unitsPerEm) * 1000),
    descent: Math.round((font.descent / font.unitsPerEm) * 1000),
    lineGap: Math.round((font.lineGap / font.unitsPerEm) * 1000),
    widths: ranges,
  };
  console.log(name, woff.length);
}
writeFileSync(new URL("../src/udf/font-metrics.json", import.meta.url), JSON.stringify(metrics));
