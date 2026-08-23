import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { bufferLooksLikeDocxZip, resolveLibreOfficeBin, runLibreofficeConvert } from "./libreoffice-convert.js";

/** LibreOffice may name its output differently, so this matches the PDF inside `--outdir`. */
async function resolveOutputPdfPath(workDir: string, inputDocxPath: string): Promise<string | null> {
  const inputBase = basename(inputDocxPath).replace(/\.docx$/i, "");
  const entries = await readdir(workDir, { withFileTypes: true });
  const pdfFiles = entries.filter((e) => e.isFile() && /\.pdf$/i.test(e.name));
  if (pdfFiles.length === 0) return null;
  const lower = inputBase.toLowerCase();
  const match = pdfFiles.find(
    (e) => basename(e.name).replace(/\.pdf$/i, "").toLowerCase() === lower,
  );
  if (match) return join(workDir, match.name);
  return join(workDir, pdfFiles[0]!.name);
}

/**
 * Converts DOCX to PDF with headless LibreOffice.
 * In production `libreoffice` or `soffice` must be on PATH; set `LIBREOFFICE_PATH` for a custom binary.
 * On macOS `/Applications/LibreOffice.app/.../soffice` is tried automatically.
 */
export async function convertDocxBufferToPdf(
  docx: Buffer,
): Promise<{ ok: true; pdf: Buffer } | { ok: false; error: string }> {
  if (!bufferLooksLikeDocxZip(docx)) {
    return {
      ok: false,
      error:
        "Could not create PDF: input is not a valid DOCX (file is empty or not a ZIP-based Office document).",
    };
  }

  const bin = await resolveLibreOfficeBin();
  if (!bin) {
    return {
      ok: false,
      error:
        "PDF conversion unavailable: LibreOffice not found. Install libreoffice or soffice, or set LIBREOFFICE_PATH to the binary.",
    };
  }

  const tmp = await mkdtemp(join(tmpdir(), "docx-pdf-"));
  const inputPath = join(tmp, "document.docx");

  const convertAttempts: { label: string; arg: string }[] = [
    { label: "pdf (default filter)", arg: "pdf" },
    { label: "pdf:writer_pdf_Export", arg: "pdf:writer_pdf_Export" },
  ];

  try {
    await writeFile(inputPath, docx);

    const stderrParts: string[] = [];

    for (let attempt = 0; attempt < convertAttempts.length; attempt++) {
      const profileDir = join(tmp, `lo-profile-${attempt}`);
      const userInstall = pathToFileURL(profileDir).href;
      const { arg, label } = convertAttempts[attempt]!;

      try {
        const { stderr } = await runLibreofficeConvert(bin, tmp, inputPath, userInstall, arg);
        if (stderr.trim()) {
          stderrParts.push(`[${label}] ${stderr.trim()}`);
        }

        const resolvedPdf = await resolveOutputPdfPath(tmp, inputPath);
        if (resolvedPdf) {
          const pdf = await readFile(resolvedPdf);
          return { ok: true, pdf };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        stderrParts.push(`[${label}] ${msg}`);
      }
    }

    let listing: string[] = [];
    try {
      listing = await readdir(tmp);
    } catch {
      /* ignore */
    }
    const mergedStderr = stderrParts.join(" · ").slice(0, 1200);
    console.error("[convertDocxBufferToPdf] all attempts failed; tmp:", listing.join(", "), mergedStderr);

    const macHint =
      process.platform === "darwin" && !bin.includes("LibreOffice.app")
        ? " macOS: use the full LibreOffice install from /Applications, or set LIBREOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice."
        : "";

    return {
      ok: false,
      error: `Could not create PDF: LibreOffice failed to convert the file (no PDF output).${macHint} Details: ${mergedStderr || listing.join(", ") || "no stderr"}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[convertDocxBufferToPdf]", e);
    return { ok: false, error: `Could not create PDF: ${msg.slice(0, 800)}` };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {
      /* ignore */
    });
  }
}
