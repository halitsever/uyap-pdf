<p align="center" class="logo-section">
<img src="https://i.ibb.co/NrPh9xP/image.png" height="80" width="80" alt="uyap-udf logo"/>
</br>
<img src="https://halitsever-api.vercel.app/api/repo-title?title=uyap-udf">

<p align="center">
Convert PDF to UYAP UDF files in the browser or with Node.js: a free online PDF to UDF converter and a TypeScript library for UYAP documents.<br>
<br/>
<a href="https://projects.halit.org/uyap-pdf/">Try it in the browser</a>: free, and files never leave your device.<br>
<br/>
<img src="https://img.shields.io/github/sponsors/halitsever" alt="GitHub Sponsors"/>
</p>
</p>

<p align="center">
<img src="https://halitsever-api.vercel.app/api/details"/>
</p>

- **Web app** - `site/` is a static, browser-only PDF → UDF converter in Turkish and English. GitHub Pages serves it through `.github/workflows/deploy.yml`, and the conversion runs entirely in the browser.
- **Node library** - converts PDF documents into UYAP UDF files. It rasterizes each page to a 200 DPI PNG and embeds it as a full-page image, so the output looks exactly like the source. Text-based converters tend to break line spacing, table widths and headers/footers; that cannot happen here.
- **No system dependencies** - PDFium compiled to WebAssembly renders the pages, so a plain `npm install` is enough on macOS, Windows and Linux. For Word documents, export to PDF first (File → Save As → PDF), then convert.

<p align="center" >
<img src="https://halitsever-api.vercel.app/api/installation"/>
</p>

```sh
npm install uyap-udf
```

Requires Node.js 22 or newer.

```ts
import { readFile, writeFile } from "node:fs/promises";
import { convertPdfBufferToUdf } from "uyap-udf";

const pdf = await readFile("document.pdf");
const outcome = await convertPdfBufferToUdf(pdf);
if (outcome.ok) await writeFile("document.udf", outcome.udf);
```

`convertPdfBufferToUdf` never throws for expected failures; it returns `{ ok: true, udf }` or `{ ok: false, error }`.

Other exports: `rasterizePdfPagesToPng`, `pxToPt`, `zeroUdfPageMargins`.

To work on the web site:

```sh
cd site
npm install
npm run dev   # local dev server
npm test      # unit tests
npm run build # production build to site/dist
```

<p align="center" href="https://github.com/halitsever/uyap-pdf/issues">
<img src="https://halitsever-api.vercel.app/api/issue"/>
</p>

<p align="center">
Found a bug or have an idea? Open an <a href="https://github.com/halitsever/uyap-pdf/issues">issue</a>.<br/>
Read the <a href=".github/CONTRIBUTING.md">contributing guide</a> before sending a pull request.
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
