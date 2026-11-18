import { FONT_FAMILIES } from "./fonts.js";
import type { UdfDocument } from "./model.js";
import { DEFAULT_STYLE, PdfBuilder, type PdfNode } from "./pdf-definition.js";

/** The slice of the pdfmake API this module uses, so Node and browser builds both fit. */
export interface PdfMake {
  virtualfs: { existsSync(name: string): boolean; writeFileSync(name: string, data: unknown): void };
  setFonts(fonts: Record<string, Record<string, string>>): void;
  setUrlAccessPolicy(policy: (url: string) => boolean): void;
  /** Node build only. */
  setLocalAccessPolicy?(policy: (path: string) => boolean): void;
  createPdf(definition: PdfNode): {
    getBuffer(): Promise<Uint8Array>;
    getStream(): Promise<{ page?: { height: number } }>;
  };
}

/** Returns the bytes of a font file such as "Tinos-Bold". */
export type FontLoader = (file: string) => Promise<Uint8Array>;

const configured = new WeakSet<object>();

function configure(pdfmake: PdfMake): void {
  if (configured.has(pdfmake)) return;
  const fonts: Record<string, Record<string, string>> = {};
  for (const family of FONT_FAMILIES) {
    fonts[family] = {
      normal: `${family}-Regular.woff`,
      bold: `${family}-Bold.woff`,
      italics: `${family}-Italic.woff`,
      bolditalics: `${family}-BoldItalic.woff`,
    };
  }
  pdfmake.setFonts(fonts);
  // Everything is local; a document must not make the page fetch anything.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy?.(() => false);
  configured.add(pdfmake);
}

async function ensureFonts(pdfmake: PdfMake, files: Iterable<string>, load: FontLoader): Promise<void> {
  const wanted = new Set(files);
  // pdfmake falls back to the regular face for its default style.
  wanted.add("Tinos-Regular");
  await Promise.all(
    [...wanted].map(async (file) => {
      const name = `${file}.woff`;
      if (!pdfmake.virtualfs.existsSync(name)) pdfmake.virtualfs.writeFileSync(name, await load(file));
    }),
  );
}

/** Lays content out on an endless page of the given width and returns its height. */
async function measureHeight(pdfmake: PdfMake, content: PdfNode[], width: number, images: Record<string, string>): Promise<number> {
  if (content.length === 0) return 0;
  const doc = await pdfmake.createPdf({ pageSize: { width, height: "auto" }, pageMargins: 0, content, images, defaultStyle: DEFAULT_STYLE }).getStream();
  return doc.page?.height ?? 0;
}

export async function renderPdf(pdfmake: PdfMake, doc: UdfDocument, loadFont: FontLoader): Promise<Uint8Array> {
  configure(pdfmake);
  const builder = new PdfBuilder(doc);
  const headerNodes = builder.sectionNodes(doc.header);
  const footerNodes = builder.sectionNodes(doc.footer);
  await ensureFonts(pdfmake, builder.fontFiles, loadFont);
  // The body starts below the header, so its height has to be known before the real layout.
  const [header, footer] = await Promise.all([
    measureHeight(pdfmake, headerNodes, builder.contentWidth, builder.images),
    measureHeight(pdfmake, footerNodes, builder.contentWidth, builder.images),
  ]);
  const definition = builder.definition({ header, footer });
  await ensureFonts(pdfmake, builder.fontFiles, loadFont);
  return pdfmake.createPdf(definition).getBuffer();
}
