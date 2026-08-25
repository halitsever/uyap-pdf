import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/uyap-pdf/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        en: resolve(import.meta.dirname, "en/index.html"),
      },
    },
  },
});
