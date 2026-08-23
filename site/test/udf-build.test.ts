import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { buildPagesHtml, pagesToUdf, pxToPt } from "../src/udf-build.js";

/** 1x1 transparent PNG. */
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("pxToPt converts 200dpi pixels to points", () => {
  assert.equal(pxToPt(200, 200), 72);
  assert.equal(pxToPt(1654, 200), (1654 / 200) * 72);
});

test("buildPagesHtml embeds each page image with pt dimensions", () => {
  const html = buildPagesHtml([
    { dataUri: PNG_1X1, widthPx: 1654, heightPx: 2339 },
    { dataUri: PNG_1X1, widthPx: 1654, heightPx: 2339 },
  ]);

  const widthPt = pxToPt(1654, 200);
  const heightPt = pxToPt(2339, 200);
  const imgCount = html.match(/<img /g)?.length ?? 0;
  assert.equal(imgCount, 2);
  assert.ok(html.includes(`width="${widthPt}"`));
  assert.ok(html.includes(`height="${heightPt}"`));
  assert.equal(html.match(/<page-break\/>/g)?.length ?? 0, 1);
});

test("pagesToUdf produces a zip whose content.xml embeds the pages with zero margins", async () => {
  const udf = await pagesToUdf([
    { dataUri: PNG_1X1, widthPx: 200, heightPx: 200 },
    { dataUri: PNG_1X1, widthPx: 200, heightPx: 200 },
  ]);

  const zip = await JSZip.loadAsync(udf);
  const content = await zip.file("content.xml")!.async("string");

  assert.equal(content.match(/<image /g)?.length ?? 0, 2);
  for (const side of ["left", "right", "top", "bottom"]) {
    assert.ok(content.includes(`${side}Margin="0.00"`), `${side}Margin should be zeroed`);
  }
});
