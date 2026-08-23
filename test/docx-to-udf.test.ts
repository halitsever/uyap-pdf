import assert from "node:assert/strict";
import { describe, test } from "node:test";
import PizZip from "pizzip";
import { pxToPt, zeroUdfPageMargins } from "../src/docx-to-udf.js";

describe("pxToPt", () => {
  test("converts pixels to points (1/72 inch) at 200 DPI", () => {
    assert.equal(pxToPt(200, 200), 72);
  });

  test("returns 0 points for 0 pixels", () => {
    assert.equal(pxToPt(0, 200), 0);
  });

  test("converts a near-A4-width pixel value to the right point value", () => {
    // At 200 DPI the A4 width (~595.28pt) is roughly 1654px.
    assert.ok(Math.abs(pxToPt(1654, 200) - 595.44) < 0.05);
  });
});

describe("zeroUdfPageMargins", () => {
  function buildFakeUdf(contentXml: string): Buffer {
    const zip = new PizZip();
    zip.file("content.xml", contentXml);
    return Buffer.from(zip.generate({ type: "uint8array" }));
  }

  function readContentXml(udf: Buffer): string {
    const zip = new PizZip(udf);
    return zip.file("content.xml")!.asText();
  }

  test("zeroes all four margins", () => {
    const udf = buildFakeUdf(
      '<properties><pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="28.35" topMargin="14.17" bottomMargin="14.17" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>',
    );
    const result = readContentXml(zeroUdfPageMargins(udf));
    assert.ok(result.includes('leftMargin="0.00"'));
    assert.ok(result.includes('rightMargin="0.00"'));
    assert.ok(result.includes('topMargin="0.00"'));
    assert.ok(result.includes('bottomMargin="0.00"'));
  });

  test("leaves non-margin attributes untouched", () => {
    const udf = buildFakeUdf(
      '<properties><pageFormat mediaSizeName="1" leftMargin="42.52" rightMargin="28.35" topMargin="14.17" bottomMargin="14.17" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>',
    );
    const result = readContentXml(zeroUdfPageMargins(udf));
    assert.ok(result.includes('mediaSizeName="1"'));
    assert.ok(result.includes('paperOrientation="1"'));
    assert.ok(result.includes('headerFOffset="20.0"'));
    assert.ok(result.includes('footerFOffset="20.0"'));
  });

  test("returns the udf unchanged when content.xml is missing", () => {
    const zip = new PizZip();
    zip.file("other.xml", "empty");
    const udf = Buffer.from(zip.generate({ type: "uint8array" }));
    const result = zeroUdfPageMargins(udf);
    assert.strictEqual(result, udf);
  });

  test("leaves content.xml unchanged when pageFormat is missing", () => {
    const udf = buildFakeUdf("<properties></properties>");
    const result = readContentXml(zeroUdfPageMargins(udf));
    assert.equal(result, "<properties></properties>");
  });
});
