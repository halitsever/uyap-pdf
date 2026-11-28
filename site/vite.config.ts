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
        wordToUdf: resolve(import.meta.dirname, "word-udf-cevirme/index.html"),
        wordToUdfEn: resolve(import.meta.dirname, "en/word-to-udf/index.html"),
        udfToWord: resolve(import.meta.dirname, "udf-word-cevirme/index.html"),
        udfToWordEn: resolve(import.meta.dirname, "en/udf-to-word/index.html"),
        udfToPdf: resolve(import.meta.dirname, "udf-pdf-cevirme/index.html"),
        udfToPdfEn: resolve(import.meta.dirname, "en/udf-to-pdf/index.html"),
        udfViewer: resolve(import.meta.dirname, "udf-goruntuleyici/index.html"),
        blog: resolve(import.meta.dirname, "blog/index.html"),
        "blog/jpg-udf-cevirme": resolve(import.meta.dirname, "blog/jpg-udf-cevirme/index.html"),
        "blog/telefonda-udf-dosyasi-acma": resolve(import.meta.dirname, "blog/telefonda-udf-dosyasi-acma/index.html"),
        "blog/udf-e-imza": resolve(import.meta.dirname, "blog/udf-e-imza/index.html"),
        "blog/udf-formati-nedir": resolve(import.meta.dirname, "blog/udf-formati-nedir/index.html"),
        "blog/udf-nasil-yapilir": resolve(import.meta.dirname, "blog/udf-nasil-yapilir/index.html"),
        "blog/uyap-dokuman-editoru": resolve(import.meta.dirname, "blog/uyap-dokuman-editoru/index.html"),
        "blog/uyap-editor-acilmiyor": resolve(import.meta.dirname, "blog/uyap-editor-acilmiyor/index.html"),
        "blog/uyap-editor-mac": resolve(import.meta.dirname, "blog/uyap-editor-mac/index.html"),
        "blog/e-imza-nedir": resolve(import.meta.dirname, "blog/e-imza-nedir/index.html"),
        "blog/e-imza-pin-bloke-kaldirma": resolve(import.meta.dirname, "blog/e-imza-pin-bloke-kaldirma/index.html"),
        "blog/uyap-e-imza-kurulumu": resolve(import.meta.dirname, "blog/uyap-e-imza-kurulumu/index.html"),
        "blog/uyap-evrak-acilmiyor": resolve(import.meta.dirname, "blog/uyap-evrak-acilmiyor/index.html"),
        "blog/uyap-java": resolve(import.meta.dirname, "blog/uyap-java/index.html"),
        "blog/uyap-vatandas-portal-nedir": resolve(import.meta.dirname, "blog/uyap-vatandas-portal-nedir/index.html"),
      },
    },
  },
});
