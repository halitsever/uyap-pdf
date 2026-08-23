import { Buffer } from "buffer";

/**
 * udf-cli asks JSZip for a "nodebuffer" result, and JSZip decides at module
 * load whether Buffer exists. This shim must be imported before udf-cli.
 */
if (typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined") {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
