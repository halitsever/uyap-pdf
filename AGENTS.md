# AGENTS.md

uyap-pdf turns PDF files into UYAP UDF documents for people filing to Türkiye's UYAP judiciary system. It holds two separate projects: the `uyap-udf` npm library at the repo root and a browser-only converter site in `site/`.

## Verify a change

CI (`.github/workflows/ci.yml`) runs two jobs on Node 22. Run the one for the part you touched:

- Library, from the repo root: `npm ci`, then `npm run build`, then `npm test`.
- Site, from `site/`: `npm ci`, then `npm test`, then `npm run build`.

## Gotchas

- The library and the site do not share code. The library renders pages with PDFium (`@hyzyla/pdfium`) and `sharp`, the site with `pdfjs-dist` and its own `site/src/udf-build.ts`. Port a conversion fix to both when it applies to both.
- There are two lockfiles, `package-lock.json` and `site/package-lock.json`, and Dependabot bumps each weekly. Commit only the lockfile of the project you changed.
- Both `package.json` files force `zod` through `overrides` to patch a security alert. Keep that override when updating dependencies.
- `site/src/buffer-shim.ts` has to be imported before `udf-cli`, because JSZip checks for `Buffer` when it loads.
- The repo is `uyap-pdf`, the npm package is `uyap-udf`. Changes to `package.json` metadata reach npm only with the owner's next publish.

## Site and deploy

- `site/` is a Vite multi-page build with `base: "/uyap-pdf/"`. The pages are `site/index.html` (Turkish, x-default) and `site/en/index.html`, both listed in `build.rollupOptions.input`.
- Every push to `main` runs `.github/workflows/deploy.yml`, which tests and builds `site/` and deploys `site/dist` to https://halitsever.github.io/uyap-pdf/. `dist` is gitignored.
- SEO lives in each page's `<head>` (canonical, hreflang, Open Graph, JSON-LD) and in `site/public/` (`robots.txt`, `sitemap.xml`, `llms.txt`, `og-tr.png`, `og-en.png`).
- When you add a page, add it to the rollup inputs, `sitemap.xml`, the hreflang links of the other pages and `site/public/llms.txt`.
- The `FAQPage` JSON-LD repeats the visible "Sık sorulan sorular" section. Edit both together, in Turkish and English.

## Conventions

- Commit subjects in conventional-commit style, in English, subject line only: no body, no trailer.
- Work on a branch and open a PR against `main`. The owner merges.
- Write new text without emoji. Keep code comments short, one line where possible, and say why.
- The README follows the owner's template. Keep every image served from `halitsever-api.vercel.app` byte-for-byte; only the `title=` value of `api/repo-title` and the issue wrapper link may be corrected.
- Leave version bumps and npm publishing to the owner.
