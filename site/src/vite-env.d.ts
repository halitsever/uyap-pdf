/// <reference types="vite/client" />

/** pdfmake ships no types for its 0.3 builds; render-pdf.ts declares the slice it uses. */
declare module "pdfmake/build/pdfmake.js";
declare module "pdfmake";
