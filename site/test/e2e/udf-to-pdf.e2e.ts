/**
 * Browser check of the UDF to PDF pages against the built site: run `npm run build` first.
 * Env: CHROME (default /usr/bin/google-chrome), E2E_OUT (artifacts), UDF_DIR (extra .udf files to try).
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import puppeteer, { type ElementHandle } from "puppeteer-core";
import { htmlToUdf } from "udf-cli";
import { pagesToUdf } from "../../src/udf-build.js";
import { TURKISH, fieldsFixture, headerFooterFixture, listsFixture, solidPng, tablesFixture, zipUdf } from "../udf-fixtures.js";

const PORT = 4179;
const ORIGIN = `http://localhost:${PORT}`;
const out = process.env.E2E_OUT ?? join(tmpdir(), "udf-to-pdf-e2e");
mkdirSync(out, { recursive: true });

interface Case {
  name: string;
  path: string;
  bytes: Uint8Array;
  /** Strings that must appear in the PDF text, in this order. */
  expect: string[];
}

async function cases(): Promise<Case[]> {
  const png = `data:image/png;base64,${solidPng(40, 56, [40, 80, 120])}`;
  const list: Case[] = [
    { name: "fields", path: "/uyap-pdf/udf-pdf-cevirme/", bytes: await zipUdf(fieldsFixture()), expect: ["ANKARA 3. İŞ", "2026/481", TURKISH, "BİRİNCİ", "İKİNCİ", "ÜÇÜNCÜ"] },
    { name: "tables", path: "/uyap-pdf/udf-pdf-cevirme/", bytes: await zipUdf(tablesFixture()), expect: ["TABLO ÖRNEĞİ", "Birleşik satır", "Birleşik sütun ğüşıöç", "Kenarsız"] },
    {
      name: "header-footer-landscape",
      path: "/uyap-pdf/en/udf-to-pdf/",
      bytes: await zipUdf(headerFooterFixture()),
      expect: ["1. Davacı", TURKISH, "T.C. İSTANBUL ANADOLU ADLİYESİ", "Sayfa 1/"],
    },
    {
      name: "lists-signed",
      path: "/uyap-pdf/udf-goruntuleyici/",
      bytes: await zipUdf(listsFixture(), { "sign.sgn": "x" }),
      expect: ["LİSTE VE BİÇİM", "Birinci madde.", "İkinci madde.", "BARKOD-1234"],
    },
    {
      name: "udf-cli",
      path: "/uyap-pdf/udf-pdf-cevirme/",
      bytes: new Uint8Array(await htmlToUdf(`<p><strong>${TURKISH} başlık</strong></p><p>Önce <em>bir</em> sonra iki.</p>`)),
      expect: [`${TURKISH} başlık`, "Önce bir sonra iki."],
    },
    { name: "pdf-to-udf-output", path: "/uyap-pdf/udf-pdf-cevirme/", bytes: await pagesToUdf([{ dataUri: png, widthPx: 1654, heightPx: 2339 }]), expect: [] },
  ];
  const extra = process.env.UDF_DIR;
  if (extra) {
    for (const file of readdirSync(extra).filter((f) => f.endsWith(".udf"))) {
      list.push({ name: `extra-${basename(file, ".udf")}`, path: "/uyap-pdf/udf-pdf-cevirme/", bytes: readFileSync(join(extra, file)), expect: [] });
    }
  }
  return list;
}

async function pdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join("") + "\n";
  }
  const pages = doc.numPages;
  await task.destroy();
  return { pages, text };
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${ORIGIN}/uyap-pdf/`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("vite preview did not start");
}

const server = spawn("node_modules/.bin/vite", ["preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let failures = 0;

try {
  await waitForServer();
  for (const c of await cases()) {
    const file = join(out, `${c.name}.udf`);
    writeFileSync(file, c.bytes);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const foreign: string[] = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(ORIGIN) && !req.url().startsWith("blob:") && !req.url().startsWith("data:")) foreign.push(req.url());
      if (req.method() !== "GET") foreign.push(`${req.method()} ${req.url()}`);
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(`${ORIGIN}${c.path}`, { waitUntil: "networkidle0" });
      const input = (await page.$("input#file-input")) as ElementHandle<HTMLInputElement> | null;
      await input!.uploadFile(file);
      await page.waitForSelector("#download", { timeout: 60_000 });
      await page.waitForSelector('.udf-page-sheet[data-rendered="true"]', { timeout: 30_000 });
      const pageCount = await page.$$eval(".udf-page", (els) => els.length);
      const sheet = await page.$(".udf-page-sheet");
      await sheet!.screenshot({ path: join(out, `${c.name}-preview.png`) });

      const base64 = await page.$eval("#download", async (a) => {
        const blob = await (await fetch((a as HTMLAnchorElement).href)).blob();
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const b of buf) s += String.fromCharCode(b);
        return btoa(s);
      });
      const pdf = new Uint8Array(Buffer.from(base64, "base64"));
      const pdfPath = join(out, `${c.name}.pdf`);
      writeFileSync(pdfPath, pdf);
      const { pages, text } = await pdfText(pdf);
      assert.equal(pages, pageCount, "preview shows every PDF page");
      let at = -1;
      for (const s of c.expect) {
        const next = text.indexOf(s, at + 1);
        assert.ok(next > at, `"${s}" missing or out of order`);
        at = next;
      }
      if (c.name === "lists-signed") {
        const notice = await page.$eval("#panel-state", (el) => el.textContent ?? "");
        assert.match(notice, /e-imzalı/);
      }
      assert.deepEqual(foreign, [], "no request leaves the site");
      assert.deepEqual(errors, [], "no page errors");
      if (spawnSync("pdftoppm", ["-v"]).status === 0) {
        spawnSync("pdftoppm", ["-png", "-r", "80", "-f", "1", "-l", "1", "-singlefile", pdfPath, join(out, `${c.name}-pdf-page1`)]);
      }
      console.log(`ok ${c.name}: ${pages} page(s)`);
    } catch (e) {
      failures++;
      console.log(`not ok ${c.name}: ${(e as Error).message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`artifacts in ${out}`);
process.exit(failures ? 1 : 0);
