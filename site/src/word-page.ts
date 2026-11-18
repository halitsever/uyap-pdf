/** Drives the UDF to Word and Word to UDF pages; the converters load only once a file is chosen. */
import "./style.css";

type Mode = "udf-to-word" | "word-to-udf";

const NOTES_TR: Record<string, string> = {
  textbox: "Metin kutularının içeriği, bulunduğu paragrafın altına normal paragraf olarak eklendi.",
  chart: "Grafikler UDF'ye aktarılmadı.",
  shape: "Şekiller ve çizimler UDF'ye aktarılmadı.",
  comments: "Word yorumları UDF'ye aktarılmadı.",
  "image-format": "Bazı resimler (EMF, WMF gibi) UDF'nin açamadığı bir biçimde olduğu için aktarılmadı.",
  sections: "Belgede birden fazla bölüm var. Bütün sayfalar son bölümün kâğıt boyutunu, kenar boşluklarını, üstbilgi ve altbilgisini kullanır.",
  embedded: "Gömülü nesneler (ör. Excel tablosu) aktarılmadı.",
  "page-size": "Kâğıt boyutu UYAP editörünün tanıdığı boyutlardan biri değil, A4 olarak yazıldı.",
  footnotes: "Dipnotlar numaralarıyla birlikte belgenin sonuna eklendi.",
};

const NOTES_EN: Record<string, string> = {
  textbox: "Text box content was added below its paragraph as ordinary paragraphs.",
  chart: "Charts were not carried into the UDF.",
  shape: "Shapes and drawings were not carried into the UDF.",
  comments: "Word comments were not carried into the UDF.",
  "image-format": "Some images (EMF, WMF and similar) use a format the UDF cannot hold and were left out.",
  sections: "The document has more than one section. All pages use the paper size, margins, header and footer of the last section.",
  embedded: "Embedded objects (such as an Excel sheet) were left out.",
  "page-size": "The paper size is not one the UYAP editor knows, so A4 was written.",
  footnotes: "Footnotes were added at the end of the document with their numbers.",
};

const STRINGS = {
  tr: {
    stepLabel: (n: number) => `Adım ${n} / 3`,
    docType: "Belge türü",
    fileName: "Dosya adı",
    size: "Boyut",
    output: "Oluşan dosya",
    reading: "Belge okunuyor.",
    another: "Başka dosya seç",
    retry: "Tekrar dene",
    pageLabel: (n: number, total: number) => `Sayfa ${n} / ${total}`,
    failed: "Belge çevrilemedi. Dosya bozuk olabilir, lütfen tekrar deneyin.",
    notes: NOTES_TR,
    "udf-to-word": {
      docTypeValue: "UYAP belgesi (.udf), tek dosya",
      docFile: "UDF dosyası",
      dropTitle: "UDF dosyanızı buraya bırakın",
      accept: ".udf",
      tag: "UDF",
      building: "Word dosyası oluşturuluyor.",
      doneTitle: "Word dosyası hazır",
      doneSub: "Word dosyasını indirebilirsiniz. Aşağıda UDF belgesinin sayfaları görünüyor.",
      download: "Word dosyasını indir",
      ext: ".docx",
      signed: "Bu UDF e-imzalı. İmza Word dosyasına taşınmaz ve Word dosyası resmî bir suret değildir. UYAP işlemleri için asıl UDF dosyasını saklayın.",
      imagesOnly:
        "Bu UDF sayfa görüntülerinden oluşuyor (ör. PDF'den çevrilmiş). Word dosyasında da sayfalar düzenlenebilir metin değil, görüntü olarak yer alır.",
      unknown: "Belgede tanınmayan bazı öğeler var. Metinleri aktarıldı, görünümleri asıl belgeden farklı olabilir.",
      wrongType: "Bu bir Word dosyası. Word'ü UDF'ye çevirmek için",
      wrongLink: "Word UDF çevirme sayfasını kullanın.",
      wrongHref: "/uyap-pdf/word-udf-cevirme/",
      notMine: "Seçilen dosya bir UDF belgesi değil. Lütfen .udf uzantılı bir dosya seçin.",
    },
    "word-to-udf": {
      docTypeValue: "Word belgesi (.docx), tek dosya",
      docFile: "Word dosyası",
      dropTitle: "Word dosyanızı buraya bırakın",
      accept: ".docx",
      tag: "DOCX",
      building: "UDF oluşturuluyor.",
      doneTitle: "UDF hazır",
      doneSub: "UDF dosyasını indirebilirsiniz. Aşağıda oluşan UDF'nin sayfaları görünüyor.",
      download: "UDF dosyasını indir",
      ext: ".udf",
      signed: "",
      imagesOnly: "",
      unknown: "",
      wrongType: "Bu bir UDF dosyası. UDF'yi Word'e çevirmek için",
      wrongLink: "UDF Word çevirme sayfasını kullanın.",
      wrongHref: "/uyap-pdf/udf-word-cevirme/",
      notMine: "Seçilen dosya bir Word belgesi değil. Lütfen .docx uzantılı bir dosya seçin.",
    },
    docBinary: "Bu dosya eski Word biçiminde (.doc). Word'de açıp Dosya → Farklı Kaydet ile Word Belgesi (.docx) olarak kaydedin, sonra tekrar deneyin.",
    rtf: "Bu dosya RTF biçiminde. Word'de açıp Dosya → Farklı Kaydet ile Word Belgesi (.docx) olarak kaydedin, sonra tekrar deneyin.",
    encrypted: "Bu Word belgesi parolayla korunuyor. Word'de parolayı kaldırıp kaydedin, sonra tekrar deneyin.",
    isPdf: "Bu bir PDF dosyası. PDF'yi UDF'ye çevirmek için",
    isPdfLink: "PDF UDF çevirme sayfasını kullanın.",
    pdfHome: "/uyap-pdf/",
    previewNote: "Önizleme bu sitenin UDF çizimidir. UYAP Doküman Editörü'nde satır sonları yer yer farklı düşebilir.",
  },
  en: {
    stepLabel: (n: number) => `Step ${n} / 3`,
    docType: "Document type",
    fileName: "File name",
    size: "Size",
    output: "Output file",
    reading: "Reading the document.",
    another: "Choose another file",
    retry: "Try again",
    pageLabel: (n: number, total: number) => `Page ${n} / ${total}`,
    failed: "The document could not be converted. The file may be corrupted, please try again.",
    notes: NOTES_EN,
    "udf-to-word": {
      docTypeValue: "UYAP document (.udf), single file",
      docFile: "UDF file",
      dropTitle: "Drop your UDF file here",
      accept: ".udf",
      tag: "UDF",
      building: "Building the Word file.",
      doneTitle: "Word file ready",
      doneSub: "Download the Word file when you are ready. The pages of the UDF are shown below.",
      download: "Download Word file",
      ext: ".docx",
      signed: "This UDF is e-signed. The signature is not carried into the Word file and the Word file is not an official copy. Keep the original UDF for UYAP.",
      imagesOnly: "This UDF is made of page images (for example converted from a PDF). The Word file holds those pages as images too, not as editable text.",
      unknown: "The document has some elements this tool does not know. Their text was carried over, but they may look different.",
      wrongType: "This is a Word file. To turn Word into UDF, use the",
      wrongLink: "Word to UDF converter.",
      wrongHref: "/uyap-pdf/en/word-to-udf/",
      notMine: "The selected file is not a UDF document. Please choose a .udf file.",
    },
    "word-to-udf": {
      docTypeValue: "Word document (.docx), single file",
      docFile: "Word file",
      dropTitle: "Drop your Word file here",
      accept: ".docx",
      tag: "DOCX",
      building: "Building the UDF.",
      doneTitle: "UDF ready",
      doneSub: "Download the UDF when you are ready. The pages of the new UDF are shown below.",
      download: "Download UDF file",
      ext: ".udf",
      signed: "",
      imagesOnly: "",
      unknown: "",
      wrongType: "This is a UDF file. To turn UDF into Word, use the",
      wrongLink: "UDF to Word converter.",
      wrongHref: "/uyap-pdf/en/udf-to-word/",
      notMine: "The selected file is not a Word document. Please choose a .docx file.",
    },
    docBinary: "This file is in the old Word format (.doc). Open it in Word, use File → Save As and choose Word Document (.docx), then try again.",
    rtf: "This file is RTF. Open it in Word, use File → Save As and choose Word Document (.docx), then try again.",
    encrypted: "This Word document is password protected. Remove the password in Word, save it and try again.",
    isPdf: "This is a PDF file. To turn a PDF into UDF, use the",
    isPdfLink: "PDF to UDF converter.",
    pdfHome: "/uyap-pdf/en/",
    previewNote: "The preview is this site's drawing of the UDF. Line breaks may fall differently in UYAP Doküman Editörü.",
  },
};

const lang = document.documentElement.lang === "en" ? "en" : "tr";
const t = STRINGS[lang];
const mode: Mode = document.body.dataset.wordMode === "word-to-udf" ? "word-to-udf" : "udf-to-word";
const m = t[mode];

const panelState = document.getElementById("panel-state")!;
const stepLabel = document.getElementById("step-label")!;
const previewEl = document.getElementById("udf-preview")!;

let activeBlobUrl: string | null = null;
let activePreview: { destroy(): Promise<void> } | null = null;
let runId = 0;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

function setStep(n: number): void {
  stepLabel.textContent = t.stepLabel(n);
}

function detailTable(rows: [string, string][]): string {
  const body = rows.map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(v)}</td></tr>`).join("");
  return `<table class="detail-table"><tbody>${body}</tbody></table>`;
}

function notice(text: string): string {
  return `<div class="notice"><span class="notice-dot" aria-hidden="true">i</span><span>${text}</span></div>`;
}

async function reset(): Promise<void> {
  runId++;
  if (activePreview) await activePreview.destroy().catch(() => undefined);
  activePreview = null;
  if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
  activeBlobUrl = null;
  previewEl.replaceChildren();
  previewEl.hidden = true;
}

function renderIdle(): void {
  void reset();
  setStep(1);
  panelState.innerHTML = `
    <div class="form-row">
      <span class="form-label">${t.docType} <span class="req" aria-hidden="true">*</span></span>
      <span class="form-value">${m.docTypeValue}</span>
    </div>
    <div class="form-row">
      <span class="form-label">${m.docFile} <span class="req" aria-hidden="true">*</span></span>
      <label class="dropzone" id="dropzone">
        <span class="pdf-icon" aria-hidden="true"><i></i><i></i><i></i><span class="tag">${m.tag}</span></span>
        <span class="dropzone-title">${m.dropTitle}</span>
        <span class="dropzone-hint">${lang === "en" ? "or click to choose from your computer" : "veya tıklayıp bilgisayarınızdan seçin"}</span>
        <input type="file" id="file-input" accept="${m.accept}" aria-required="true" hidden />
      </label>
    </div>`;
  wireDropzone();
}

function renderWorking(file: File, status: string): void {
  setStep(2);
  panelState.innerHTML = `
    ${detailTable([
      [t.fileName, file.name],
      [t.size, formatSize(file.size)],
    ])}
    <div class="actions"><span class="status-text" id="status-text" role="status">${escapeHtml(status)}</span></div>`;
}

function setStatus(text: string): void {
  const el = document.getElementById("status-text");
  if (el) el.textContent = text;
}

function renderError(html: string): void {
  void reset();
  setStep(1);
  panelState.innerHTML = `
    <div class="notice error"><span class="notice-dot" aria-hidden="true">!</span><span>${html}</span></div>
    <div class="actions"><button class="btn-primary" id="retry" type="button">${t.retry}</button></div>`;
  document.getElementById("retry")!.addEventListener("click", renderIdle);
}

function renderDone(file: File, outName: string, outSize: number, notes: string[]): void {
  setStep(3);
  panelState.innerHTML = `
    <div class="notice success">
      <span class="notice-dot" aria-hidden="true">✓</span>
      <span><strong>${m.doneTitle}</strong><span class="sub">${m.doneSub}</span></span>
    </div>
    ${notes.map(notice).join("")}
    ${detailTable([
      [t.fileName, file.name],
      [t.output, `${outName} (${formatSize(outSize)})`],
    ])}
    <div class="actions">
      <a class="btn-download" id="download" href="${activeBlobUrl}" download="${escapeHtml(outName)}">${m.download}</a>
      <button class="btn-secondary" id="again" type="button">${t.another}</button>
    </div>`;
  document.getElementById("again")!.addEventListener("click", renderIdle);
}

/** Shows the UDF through the UDF to PDF renderer; a failed preview does not undo a finished conversion. */
async function preview(udf: ArrayBuffer | Uint8Array, run: number): Promise<void> {
  try {
    const { convertUdf, showPreview } = await import("./udf/browser.js");
    if (run !== runId) return;
    const bytes = udf instanceof Uint8Array ? udf.slice().buffer : udf.slice(0);
    const { pdf } = await convertUdf(bytes);
    if (run !== runId) return;
    previewEl.hidden = false;
    const shown = await showPreview(pdf, previewEl, t.pageLabel);
    if (run !== runId) {
      await shown.destroy();
      return;
    }
    activePreview = shown;
    previewEl.insertAdjacentHTML("afterbegin", `<p class="preview-note">${t.previewNote}</p>`);
  } catch (e) {
    console.error("[preview]", e);
    previewEl.hidden = true;
  }
}

function base(name: string): string {
  return name.replace(/\.(udf|docx|docm|doc)$/i, "");
}

async function open(file: File | undefined | null): Promise<void> {
  if (!file) return;
  await reset();
  const run = runId;
  const name = file.name.toLowerCase();
  if (/\.pdf$/.test(name) || file.type === "application/pdf") {
    renderError(`${t.isPdf} <a href="${t.pdfHome}">${t.isPdfLink}</a>`);
    return;
  }
  const otherSide = mode === "udf-to-word" ? /\.(docx|docm|doc)$/.test(name) : /\.udf$/.test(name);
  if (otherSide) {
    renderError(`${m.wrongType} <a href="${m.wrongHref}">${m.wrongLink}</a>`);
    return;
  }
  renderWorking(file, t.reading);
  try {
    const [lib, data] = await Promise.all([import("./udf/word-browser.js"), file.arrayBuffer()]);
    if (run !== runId) return;
    setStatus(m.building);
    let out: Uint8Array;
    let notes: string[] = [];
    let previewSource: ArrayBuffer | Uint8Array;
    if (mode === "udf-to-word") {
      const result = await lib.udfToWord(data);
      out = result.docx;
      notes = [result.doc.signed && t["udf-to-word"].signed, result.imagesOnly && t["udf-to-word"].imagesOnly, result.doc.unknownElements.length > 0 && t["udf-to-word"].unknown].filter(
        (x): x is string => !!x,
      );
      previewSource = data;
    } else {
      const result = await lib.wordToUdf(data);
      out = result.udf;
      notes = result.notes.map((n) => t.notes[n]).filter(Boolean);
      previewSource = out;
    }
    if (run !== runId) return;
    const type = mode === "udf-to-word" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/octet-stream";
    activeBlobUrl = URL.createObjectURL(new Blob([out.slice().buffer], { type }));
    renderDone(file, base(file.name) + m.ext, out.length, notes);
    await preview(previewSource, run);
  } catch (e) {
    if (run !== runId) return;
    console.error("[word]", e);
    const code = (e as { code?: string }).code;
    renderError(
      code === "doc-binary"
        ? t.docBinary
        : code === "rtf"
          ? t.rtf
          : code === "encrypted"
            ? t.encrypted
            : code === "not-zip" || code === "no-content" || code === "not-docx"
              ? m.notMine
              : t.failed,
    );
  }
}

function wireDropzone(): void {
  const zone = document.getElementById("dropzone");
  const input = document.getElementById("file-input") as HTMLInputElement | null;
  if (!zone || !input) return;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    void open(file);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    void open(e.dataTransfer?.files?.[0]);
  });
}

// The idle state ships in the static HTML; wire it up on load.
wireDropzone();
