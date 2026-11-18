# AGENTS.md

uyap-pdf turns PDF files into UYAP UDF documents for people filing to Türkiye's UYAP judiciary system. The site also turns UDF into PDF and Word, and Word into UDF. It holds two separate projects: the `uyap-udf` npm library at the repo root and a browser-only converter site in `site/`.

## Verify a change

CI (`.github/workflows/ci.yml`) runs two jobs on Node 22. Run the one for the part you touched:

- Library, from the repo root: `npm ci`, then `npm run build`, then `npm test`.
- Site, from `site/`: `npm ci`, then `npm test`, then `npm run build`.
- The UDF and Word pages in a real browser (not in CI): `npm run build`, then `npm run test:e2e`. It serves `dist` with `vite preview`, drives `/usr/bin/google-chrome` (override with `CHROME`), and writes each fixture's input, output, preview PNG and pdftoppm render to `E2E_OUT`. `UDF_DIR` adds your own .udf files, `DOCX_DIR` your own .docx files; with `soffice` on PATH the produced .docx files are rendered to PNG too.

## Gotchas

- The library and the site do not share code. The library renders pages with PDFium (`@hyzyla/pdfium`) and `sharp`, the site with `pdfjs-dist` and its own `site/src/udf-build.ts`. Port a conversion fix to both when it applies to both.
- The library declares `engines.node` `>=22`, the floor `@hyzyla/pdfium` 3 sets. Root `@types/node` stays on that major.
- There are two lockfiles, `package-lock.json` and `site/package-lock.json`, and Dependabot bumps each monthly. Commit only the lockfile of the project you changed.
- Both `package.json` files force `zod` through `overrides` to patch a security alert. Keep that override when updating dependencies.
- `site/src/buffer-shim.ts` has to be imported before `udf-cli`, because JSZip checks for `Buffer` when it loads.
- pdf.js loads its CMaps, ICC profile, standard fonts and wasm decoders by URL at runtime. The `pdfjs-assets` plugin in `site/vite.config.ts` serves them under `/uyap-pdf/pdfjs/`, and `site/src/convert-pdf.ts` passes those URLs to `getDocument`. Keep both in step when upgrading `pdfjs-dist`.
- The repo is `uyap-pdf`, the npm package is `uyap-udf`. Changes to `package.json` metadata reach npm only with the owner's next publish.

## UDF to PDF

- `site/src/udf/` holds the UDF reader and both reverse converters. `parse.ts` (with `xml.ts`) reads a UDF into the renderer-neutral model in `model.ts` and has no DOM dependency, so it can move into the library; the Word converters below read and write the same model. `pdf-definition.ts` turns the model into a pdfmake document, `render-pdf.ts` measures the header and footer and runs pdfmake, and `browser.ts` is the lazy browser chunk that also shows the preview by rendering the generated PDF with pdf.js.
- `src/udf-page.ts` drives `udf-pdf-cevirme/`, `en/udf-to-pdf/` and `udf-goruntuleyici/`; `data-udf-mode` on `<body>` picks convert or view wording. Nothing from `src/udf/` may be imported statically by a page entry, or every page gets heavier.
- Element text comes from the CDATA pool by `startOffset`/`length` in UTF-16 units. Attributes resolve like Swing: the element, its `resolver` style chain, then its parent element, then the `<elements resolver>` style.
- In the model, tab stops are measured from the left margin; the parser adds the paragraph's `LeftIndent` to `TabSet` positions and the writer subtracts it. Without a `TabSet` they fall every 72pt. pdfmake has no tabs, so `pdf-definition.ts` lays out each line with `font-metrics.json` and turns a tab into a blank run of the right width. Kerning and ligatures are off because the editor draws without them.
- The fonts in `src/udf/fonts/` are OFL subsets of Tinos, Arimo and Cousine (metric-compatible with Times New Roman, Arial, Courier New). Rebuild them and `font-metrics.json` together with `scripts/subset-fonts.mjs`; keep them WOFF 1, because fontkit fails on composite glyphs in WOFF 2. Licences are in `public/THIRD-PARTY-NOTICES.txt`.

## Word converters

- `docx-read.ts` reads a .docx into the same model (styles with `basedOn`, theme fonts, numbering with `startOverride`, fields, footnotes, header and footer parts) without a DOM. `udf-write.ts` writes the model as a UDF, `docx-write.ts` as a .docx with the `docx` package. `word-browser.ts` is their lazy chunk and `src/word-page.ts` drives `word-udf-cevirme/`, `en/word-to-udf/`, `udf-word-cevirme/` and `en/udf-to-word/` (`data-word-mode` on `<body>`). The preview loads `browser.js` afterwards and draws the UDF with the UDF to PDF renderer.
- What UYAP Doküman Editörü 5.4.20 does, checked by opening files in it: TabSet positions count from the paragraph's `LeftIndent`; `Hanging` keeps the first line at `LeftIndent` and moves the rest; `ListLevel` starts at 1 (0 acts as 1) and one `ListId` shares a counter across levels; numbering formats are spelled `PARANTHESE`, `D_PARANTHESE` is "(1)" and `TRE` is "1-"; there are no row spans, and merged columns are saved as a row with fewer cells and its own `columnSpans`; cell fills and tab leaders are not drawn; a 0.5pt border is lost on a table's left edge. It saves the header text first in the pool.
- The editor fails on some numbers with a fraction: a decimal `columnSpans` breaks the layout and a decimal `pageNumber-fontSize` stops the file from opening ("Dosya açılamadı"). `udf-write.ts` writes both as whole numbers; indents, spacing, font sizes, image sizes, border widths and `height_min` take decimals.
- Legacy .doc (OLE) and RTF are refused with a "save as .docx" message, as are password-protected .docx files. Keep that in step with the page copy.

## Site and deploy

- `site/` is a Vite multi-page build with `base: "/uyap-pdf/"`. The pages are `site/index.html` (Turkish, x-default) and `site/en/index.html` for PDF to UDF, `site/udf-pdf-cevirme/` with `site/en/udf-to-pdf/` for UDF to PDF, the Turkish-only viewer `site/udf-goruntuleyici/`, `site/word-udf-cevirme/` with `site/en/word-to-udf/` for Word to UDF, `site/udf-word-cevirme/` with `site/en/udf-to-word/` for UDF to Word, and the Turkish-only guide `site/udf-dosyasi-nedir-nasil-acilir/`, all listed in `build.rolldownOptions.input`. The guide loads `src/guide.ts`, which pulls in the styles without a converter.
- Every push to `main` runs `.github/workflows/deploy.yml`, which tests and builds `site/` and deploys `site/dist` to https://halitsever.github.io/uyap-pdf/. `dist` is gitignored.
- SEO lives in each page's `<head>` (canonical, hreflang, Open Graph, JSON-LD) and in `site/public/` (`robots.txt`, `sitemap.xml`, `llms.txt`, `og-tr.png`, `og-en.png`).
- When you add a page, add it to the rollup inputs, `sitemap.xml`, the hreflang links of the other pages and `site/public/llms.txt`.
- The guides name UYAP Doküman Editörü commands (`PDF Olarak Kaydet`, `DOC Olarak Kaydet`) and link only to official pages on uyap.gov.tr. Check those against https://www.uyap.gov.tr/Uyap-Editor before changing them.
- The `FAQPage` JSON-LD repeats the visible "Sık sorulan sorular" section. Edit both together, in Turkish and English.

## Conventions

- Commit subjects in conventional-commit style, in English, subject line only: no body, no trailer.
- Work on a branch and open a PR against `main`. The owner merges.
- Write new text without emoji. Keep code comments short, one line where possible, and say why.
- The README follows the owner's template. Keep every image served from `halitsever-api.vercel.app` byte-for-byte; only the `title=` value of `api/repo-title` and the issue wrapper link may be corrected.
- Leave version bumps and npm publishing to the owner.
