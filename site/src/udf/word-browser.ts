/** Browser side of the Word converters: loaded lazily, so pages stay light until a file is chosen. */
import type { Block, ImageData, UdfDocument } from "./model.js";
import { readUdf } from "./parse.js";
import { readDocx, type DocxNote } from "./docx-read.js";
import { writeUdf } from "./udf-write.js";
import { writeDocx } from "./docx-write.js";

/** Both Word and the editor's Java runtime read PNG, JPEG, GIF and BMP; anything else is redrawn as PNG. */
async function toPortable(image: ImageData): Promise<ImageData | null> {
  if (image.mime === "image/png" || image.mime === "image/jpeg" || image.mime === "image/gif" || image.mime === "image/bmp") return image;
  try {
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mime }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return { base64: canvas.toDataURL("image/png").split(",")[1], mime: "image/png" };
  } catch {
    return null;
  }
}

async function portableImages(blocks: Block[]): Promise<number> {
  let dropped = 0;
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const kept = [];
      for (const run of block.inlines) {
        if (run.type !== "image") kept.push(run);
        else {
          const image = await toPortable(run.image);
          if (image) kept.push({ ...run, image });
          else dropped++;
        }
      }
      block.inlines = kept;
    } else if (block.type === "table") {
      for (const row of block.rows) for (const cell of row.cells) dropped += await portableImages(cell.blocks);
    }
  }
  return dropped;
}

async function portableDocument(doc: UdfDocument): Promise<number> {
  let dropped = await portableImages(doc.body);
  if (doc.header) dropped += await portableImages(doc.header.blocks);
  if (doc.footer) dropped += await portableImages(doc.footer.blocks);
  if (doc.background) {
    const image = await toPortable(doc.background.image);
    if (image) doc.background.image = image;
    else doc.background = null;
  }
  return dropped;
}

/** True when the UDF holds page images and no text, as PDF to UDF tools write it. */
function imagesOnly(doc: UdfDocument): boolean {
  let text = false;
  let images = false;
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.type === "paragraph") {
        for (const i of b.inlines) {
          if (i.type === "image") images = true;
          else if (i.type === "text" && i.text.trim()) text = true;
        }
      } else if (b.type === "table") for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
    }
  };
  walk(doc.body);
  return images && !text;
}

export interface UdfToWordResult {
  doc: UdfDocument;
  docx: Uint8Array;
  imagesOnly: boolean;
}

export async function udfToWord(data: ArrayBuffer): Promise<UdfToWordResult> {
  const doc = await readUdf(data);
  await portableDocument(doc);
  return { doc, docx: await writeDocx(doc), imagesOnly: imagesOnly(doc) };
}

export interface WordToUdfResult {
  doc: UdfDocument;
  udf: Uint8Array;
  notes: DocxNote[];
}

export async function wordToUdf(data: ArrayBuffer): Promise<WordToUdfResult> {
  const { doc, notes } = await readDocx(data);
  if ((await portableDocument(doc)) > 0 && !notes.includes("image-format")) notes.push("image-format");
  return { doc, udf: await writeUdf(doc), notes };
}
