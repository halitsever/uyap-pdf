# udf-converter

Converts PDF and DOCX documents into UYAP UDF files. Each page is rasterized to a
high-resolution PNG (200 DPI) and embedded into the UDF as a full-page image, so the
output is a pixel-faithful copy of the source pages. Layout quirks of text-based
converters (line spacing, table widths, lost headers/footers) do not apply.

## Web site

`site/` contains a static, browser-only PDF → UDF converter (Vite) deployed to GitHub
Pages by `.github/workflows/deploy.yml`: <https://halitsever.github.io/udf-converter/>.
Conversion runs fully client-side; files never leave the browser.

```sh
cd site
npm install
npm run dev   # local dev server
npm test      # unit tests
npm run build # production build to site/dist
```

## System requirements

PDF → UDF conversion is self-contained: pages are rendered with PDFium compiled
to WebAssembly (`@hyzyla/pdfium`), so it works on macOS, Windows and Linux with a
plain `npm install`.

DOCX → UDF additionally needs LibreOffice installed on the machine:

| Binary | Used for | Override env var |
| --- | --- | --- |
| LibreOffice (`libreoffice` / `soffice`) | DOCX → PDF | `LIBREOFFICE_PATH` |

macOS: `brew install --cask libreoffice`. The full `/Applications/LibreOffice.app`
install is auto-detected. Debian/Ubuntu: `apt-get install libreoffice`. Windows:
the default `C:\Program Files\LibreOffice` install is auto-detected.

## Install

```sh
npm install udf-converter
```

## Usage

```ts
import { readFile, writeFile } from "node:fs/promises";
import { convertDocxBufferToUdf, convertPdfBufferToUdf } from "udf-converter";

// DOCX → UDF (goes through LibreOffice DOCX → PDF first)
const docx = await readFile("tutanak.docx");
const outcome = await convertDocxBufferToUdf(docx);
if (outcome.ok) {
  await writeFile("tutanak.udf", outcome.udf);
} else {
  console.error(outcome.error);
}

// PDF → UDF (skips LibreOffice entirely)
const pdf = await readFile("tutanak.pdf");
const fromPdf = await convertPdfBufferToUdf(pdf);
```

Conversion functions never throw for expected failures; they return
`{ ok: true, udf }` or `{ ok: false, error }`.

### Other exports

- `convertDocxBufferToPdf(docx)` – DOCX → PDF via headless LibreOffice
- `rasterizePdfPagesToPng(pdf, dpi?)` – PDF pages as ordered PNG buffers
- `pxToPt(px, dpi)` / `zeroUdfPageMargins(udf)` – low-level helpers
- `bufferLooksLikeDocxZip(buf)` – cheap DOCX sanity check

## Development

```sh
npm install
npm test      # unit tests (node:test)
npm run build # compile to dist/
```
