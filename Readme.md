<p align="center" class="logo-section">
<img src="https://i.ibb.co/NrPh9xP/image.png" height="80" width="80"/>
</br>
<img src="https://halitsever-api.vercel.app/api/repo-title?title=udf-kit">

<p align="center">
PDF to UDF converter — a UDF (UYAP file type) toolkit for JavaScript.<br>
<br/>
🌐 <a href="https://halitsever.github.io/udf-kit/">Try it in the browser</a> — free, files never leave your device.<br>
<br/>
<img src="https://img.shields.io/github/sponsors/halitsever"/>
</p>
</p>

<p align="center">
<img src="https://halitsever-api.vercel.app/api/details"/>
</p>

- 🖥️ **Web app** — `site/` hosts a static, browser-only PDF → UDF converter (Turkish + English), deployed to GitHub Pages by `.github/workflows/deploy.yml`. Conversion runs fully client-side.
- 📚 **Node library** — converts PDF documents into UYAP UDF files. Each page is rasterized to a high-resolution PNG (200 DPI) and embedded as a full-page image, so the output is a pixel-faithful copy of the source. Layout quirks of text-based converters (line spacing, table widths, lost headers/footers) do not apply.
- 🔁 Fully self-contained: pages are rendered with PDFium compiled to WebAssembly, so a plain `npm install` works on macOS, Windows and Linux. For Word documents, export to PDF first (File → Save As → PDF), then convert.

<p align="center" >
<img src="https://halitsever-api.vercel.app/api/installation"/>
</p>

```sh
npm install udf-kit
```

```ts
import { readFile, writeFile } from "node:fs/promises";
import { convertPdfBufferToUdf } from "udf-kit";

const pdf = await readFile("document.pdf");
const outcome = await convertPdfBufferToUdf(pdf);
if (outcome.ok) await writeFile("document.udf", outcome.udf);
```

`convertPdfBufferToUdf` never throws for expected failures; it returns `{ ok: true, udf }` or `{ ok: false, error }`.

Other exports: `rasterizePdfPagesToPng`, `pxToPt`, `zeroUdfPageMargins`.

Web site development:

```sh
cd site
npm install
npm run dev   # local dev server
npm test      # unit tests
npm run build # production build to site/dist
```

<p align="center" href="https://github.com/halitsever/udf-kit/issues">
<img src="https://halitsever-api.vercel.app/api/issue"/>
</p>

<p align="center">
<img src="https://halitsever-api.vercel.app/api/sponsor"/>
</p>

<p align="center">
<img src="https://halitsever-api.vercel.app/api/license"/>
</p>

<p align="center">
  MIT
</p>
