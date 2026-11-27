/**
 * Browser check of the Word to UDF and UDF to Word pages against the built site: run `npm run build` first.
 * Env: CHROME (default /usr/bin/google-chrome), E2E_OUT (artifacts), DOCX_DIR (extra .docx files to try).
 * With LibreOffice on PATH the produced .docx files are also rendered to PNG.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import type { Block } from "../../src/udf/model.js";
import { readUdf } from "../../src/udf/parse.js";
import { TURKISH, wordDocx } from "../docx-fixtures.js";
import { pagesToUdf } from "../../src/udf-build.js";
import { headerFooterFixture, listsFixture, solidPng, tablesFixture, zipUdf } from "../udf-fixtures.js";

const PORT = 4180;
const ORIGIN = `http://localhost:${PORT}`;
const out = process.env.E2E_OUT ?? join(tmpdir(), "word-e2e");
mkdirSync(out, { recursive: true });

interface Case {
  name: string;
  path: string;
  file: string;
  bytes: Uint8Array;
  /** Strings that must appear in the output, in this order. */
  expect: string[];
  /** Text the page must show instead of a download. */
  error?: RegExp;
  /** A notice the finished page must show. */
  note?: RegExp;
}

const texts = (blocks: Block[]): string =>
  blocks
    .map((b) =>
      b.type === "paragraph"
        ? b.inlines.map((i) => (i.type === "text" ? i.text : i.type === "tab" ? "\t" : "")).join("")
        : b.type === "table"
          ? b.rows.map((r) => r.cells.map((c) => texts(c.blocks)).join("\n")).join("\n")
          : "",
    )
    .join("\n");

async function cases(): Promise<Case[]> {
  const fixture = await wordDocx();
  const ole = new Uint8Array(4096);
  ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const list: Case[] = [
    {
      name: "word-to-udf",
      path: "/uyap-pdf/word-udf-cevirme/",
      file: "dilekce.docx",
      bytes: fixture,
      expect: ["T.C. ANKARA 3. İŞ MAHKEMESİ", "Davacı vekili", TURKISH, "DAVACI\t: Mehmet", "Birinci madde", "Alt madde", "Birleşik sütun", "Dikey", "Sayfa sonu sonrası", "Yargıtay"],
    },
    { name: "word-to-udf-en", path: "/uyap-pdf/en/word-to-udf/", file: "petition.docx", bytes: fixture, expect: ["T.C. ANKARA", "Toplam\t1.250,00 TL"] },
    { name: "word-to-udf-doc", path: "/uyap-pdf/word-udf-cevirme/", file: "eski.doc", bytes: ole, expect: [], error: /\.docx/ },
    {
      name: "udf-to-word-tables",
      path: "/uyap-pdf/udf-word-cevirme/",
      file: "tablo.udf",
      bytes: await zipUdf(tablesFixture()),
      expect: ["TABLO ÖRNEĞİ", "Birleşik satır", "Birleşik sütun ğüşıöç", "Kenarsız", "Oransal sağ"],
    },
    {
      name: "udf-to-word-header-footer",
      path: "/uyap-pdf/en/udf-to-word/",
      file: "letter.udf",
      bytes: await zipUdf(headerFooterFixture()),
      expect: ["T.C. İSTANBUL ANADOLU ADLİYESİ", "1. Davacı", TURKISH, "30. Davacı", "Altbilgi: gizli belge"],
    },
    { name: "udf-to-word-lists", path: "/uyap-pdf/udf-word-cevirme/", file: "liste.udf", bytes: await zipUdf(listsFixture()), expect: ["LİSTE VE BİÇİM", "Birinci madde.", "BARKOD-1234"] },
    {
      name: "udf-to-word-page-images",
      path: "/uyap-pdf/udf-word-cevirme/",
      file: "pdf-den.udf",
      bytes: await pagesToUdf([{ dataUri: `data:image/png;base64,${solidPng(40, 56, [40, 80, 120])}`, widthPx: 1654, heightPx: 2339 }]),
      expect: [],
      note: /sayfa görüntülerinden/,
    },
  ];
  const extra = process.env.DOCX_DIR;
  if (extra) {
    for (const file of readdirSync(extra).filter((f) => f.endsWith(".docx"))) {
      list.push({ name: `extra-${basename(file, ".docx")}`, path: "/uyap-pdf/word-udf-cevirme/", file, bytes: readFileSync(join(extra, file)), expect: [] });
    }
  }
  return list;
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

async function download(page: Page): Promise<Uint8Array> {
  const base64 = await page.$eval("#download", async (a) => {
    const blob = await (await fetch((a as HTMLAnchorElement).href)).blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  });
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function inOrder(haystack: string, needles: string[]): void {
  let at = -1;
  for (const s of needles) {
    const next = haystack.indexOf(s, at + 1);
    assert.ok(next > at, `"${s}" missing or out of order`);
    at = next;
  }
}

const server = spawn("node_modules/.bin/vite", ["preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const soffice = spawnSync("soffice", ["--version"]).status === 0;
let failures = 0;

try {
  await waitForServer();

  // The converters are lazy: no page may fetch them before a file is chosen.
  for (const path of ["/uyap-pdf/", "/uyap-pdf/udf-pdf-cevirme/", "/uyap-pdf/word-udf-cevirme/", "/uyap-pdf/udf-word-cevirme/"]) {
    const page = await browser.newPage();
    const fetched: string[] = [];
    page.on("request", (req) => fetched.push(req.url()));
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle0" });
    const heavy = fetched.filter((u) => /word-browser|\/browser-|docx/.test(u));
    if (heavy.length) {
      failures++;
      console.log(`not ok lazy ${path}: ${heavy.join(", ")}`);
    } else console.log(`ok lazy ${path}`);
    await page.close();
  }

  for (const c of await cases()) {
    const file = join(out, `${c.name}-${c.file}`);
    writeFileSync(file, c.bytes);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const foreign: string[] = [];
    page.on("request", (req) => {
      // The Cloudflare page-view beacon carries no file data.
      if (/^https:\/\/(static\.)?cloudflareinsights\.com\//.test(req.url())) return;
      if (!req.url().startsWith(ORIGIN) && !req.url().startsWith("blob:") && !req.url().startsWith("data:")) foreign.push(req.url());
      if (req.method() !== "GET") foreign.push(`${req.method()} ${req.url()}`);
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(`${ORIGIN}${c.path}`, { waitUntil: "networkidle0" });
      const input = (await page.$("input#file-input")) as ElementHandle<HTMLInputElement> | null;
      await input!.uploadFile(file);
      if (c.error) {
        await page.waitForSelector(".notice.error", { timeout: 30_000 });
        const message = await page.$eval(".notice.error", (el) => el.textContent ?? "");
        assert.match(message, c.error);
        console.log(`ok ${c.name}: ${message.trim().slice(0, 80)}`);
        continue;
      }
      await page.waitForSelector("#download", { timeout: 60_000 });
      const bytes = await download(page);
      const isUdf = c.path.includes("word-udf") || c.path.includes("word-to-udf");
      const outPath = join(out, `${c.name}.${isUdf ? "udf" : "docx"}`);
      writeFileSync(outPath, bytes);
      let text: string;
      if (isUdf) {
        const doc = await readUdf(bytes);
        text = [doc.header && texts(doc.header.blocks), texts(doc.body), doc.footer && texts(doc.footer.blocks)].filter(Boolean).join("\n");
      } else {
        // mammoth reads the body only, so header and footer text comes straight from their parts.
        const zip = await JSZip.loadAsync(bytes);
        const part = async (re: RegExp) => {
          const names = Object.keys(zip.files).filter((n) => re.test(n));
          const xml = await Promise.all(names.map((n) => zip.file(n)!.async("string")));
          return xml.map((x) => [...x.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")).join("\n");
        };
        text = [await part(/^word\/header\d*\.xml$/), (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value, await part(/^word\/footer\d*\.xml$/)].join("\n");
        if (soffice) {
          const pdfDir = join(out, "docx-pdf");
          spawnSync("soffice", [`-env:UserInstallation=file://${join(out, "lo-profile")}`, "--headless", "--convert-to", "pdf", "--outdir", pdfDir, outPath], { timeout: 120_000 });
          spawnSync("pdftoppm", ["-png", "-r", "70", "-f", "1", "-l", "1", "-singlefile", join(pdfDir, `${c.name}.pdf`), join(out, `${c.name}-word-page1`)]);
        }
      }
      inOrder(text, c.expect);
      await page.waitForSelector('.udf-page-sheet[data-rendered="true"]', { timeout: 60_000 });
      await page.screenshot({ path: join(out, `${c.name}-panel.png`), fullPage: true });
      const sheet = await page.$(".udf-page-sheet");
      await sheet!.screenshot({ path: join(out, `${c.name}-preview.png`) });
      const notes = await page.$$eval("#panel-state .notice:not(.success)", (els) => els.map((e) => e.textContent?.trim() ?? ""));
      if (c.note) assert.ok(notes.some((n) => c.note!.test(n)), `notice ${c.note}`);
      if (c.name === "word-to-udf") assert.ok(notes.some((n) => /Dipnot/.test(n)) && notes.some((n) => /Metin kutu/.test(n)), "footnote and text box notes");
      assert.deepEqual(foreign, [], "no request leaves the site");
      assert.deepEqual(errors, [], "no page errors");
      console.log(`ok ${c.name}: ${bytes.length} bytes`);
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
