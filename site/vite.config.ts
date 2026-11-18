import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const base = "/uyap-pdf/";

/** pdf.js fetches these by directory URL at runtime, so they cannot go through the hashed asset pipeline. */
const PDFJS_ASSET_DIRS = ["cmaps", "iccs", "standard_fonts", "wasm"];
const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

function pdfjsAssets(): Plugin {
  const files = PDFJS_ASSET_DIRS.flatMap((dir) => readdirSync(join(pdfjsRoot, dir)).map((name) => `${dir}/${name}`));
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(`${base}pdfjs/`, (req, res, next) => {
        const file = req.url?.split("?")[0].slice(1) ?? "";
        if (!files.includes(file)) return next();
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        res.end(readFileSync(join(pdfjsRoot, file)));
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: "asset", fileName: `pdfjs/${file}`, source: readFileSync(join(pdfjsRoot, file)) });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [pdfjsAssets()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        en: resolve(import.meta.dirname, "en/index.html"),
        udfGuide: resolve(import.meta.dirname, "udf-dosyasi-nedir-nasil-acilir/index.html"),
        wordGuide: resolve(import.meta.dirname, "word-udf-cevirme/index.html"),
      },
    },
  },
});
