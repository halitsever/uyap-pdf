/** Drives the UDF to PDF and UDF viewer pages; the converter itself loads only once a file is chosen. */
import "./style.css";

type Mode = "convert" | "view";

const STRINGS = {
  tr: {
    stepLabel: (n: number) => `Adım ${n} / 3`,
    docType: "Belge türü",
    docTypeValue: "UYAP belgesi (.udf), tek dosya",
    docFile: "UDF dosyası",
    dropTitle: "UDF dosyanızı buraya bırakın",
    dropHint: "veya tıklayıp bilgisayarınızdan seçin",
    fileName: "Dosya adı",
    size: "Boyut",
    pages: "Sayfa sayısı",
    reading: "Belge okunuyor.",
    building: "PDF oluşturuluyor.",
    previewing: "Önizleme hazırlanıyor.",
    convertDoneTitle: "PDF hazır",
    convertDoneSub: "Aşağıda sayfaları görebilir, PDF dosyasını indirebilirsiniz.",
    viewDoneTitle: "Belge açıldı",
    viewDoneSub: "Sayfalar aşağıda. İsterseniz PDF olarak da indirebilirsiniz.",
    downloadConvert: "PDF dosyasını indir",
    downloadView: "PDF olarak indir",
    another: "Başka dosya aç",
    retry: "Tekrar dene",
    signed: "Bu UDF e-imzalı. İmza PDF'ye taşınmaz ve PDF resmî bir suret değildir. UYAP işlemleri için asıl UDF dosyasını saklayın.",
    unknown: "Belgede tanınmayan bazı öğeler var. Metinleri gösterildi, görünümleri asıl belgeden farklı olabilir.",
    isPdf: "Bu bir PDF dosyası. PDF'yi UDF'ye çevirmek için",
    isPdfLink: "PDF UDF çevirme sayfasını kullanın.",
    notUdf: "Seçilen dosya bir UDF belgesi değil. Lütfen .udf uzantılı bir dosya seçin.",
    failed: "Belge açılamadı. Dosya bozuk olabilir, lütfen tekrar deneyin.",
    pageLabel: (n: number, total: number) => `Sayfa ${n} / ${total}`,
    pdfHome: "/uyap-pdf/",
  },
  en: {
    stepLabel: (n: number) => `Step ${n} / 3`,
    docType: "Document type",
    docTypeValue: "UYAP document (.udf), single file",
    docFile: "UDF file",
    dropTitle: "Drop your UDF file here",
    dropHint: "or click to choose from your computer",
    fileName: "File name",
    size: "Size",
    pages: "Pages",
    reading: "Reading the document.",
    building: "Building the PDF.",
    previewing: "Preparing the preview.",
    convertDoneTitle: "PDF ready",
    convertDoneSub: "The pages are shown below. Download the PDF when you are ready.",
    viewDoneTitle: "Document opened",
    viewDoneSub: "The pages are shown below. You can also download them as a PDF.",
    downloadConvert: "Download PDF",
    downloadView: "Download as PDF",
    another: "Open another file",
    retry: "Try again",
    signed: "This UDF is e-signed. The signature is not carried into the PDF and the PDF is not an official copy. Keep the original UDF for UYAP.",
    unknown: "The document has some elements this tool does not know. Their text is shown, but they may look different from the original.",
    isPdf: "This is a PDF file. To turn a PDF into UDF, use the",
    isPdfLink: "PDF to UDF converter.",
    notUdf: "The selected file is not a UDF document. Please choose a .udf file.",
    failed: "The document could not be opened. The file may be corrupted, please try again.",
    pageLabel: (n: number, total: number) => `Page ${n} / ${total}`,
    pdfHome: "/uyap-pdf/en/",
  },
};

const lang = document.documentElement.lang === "en" ? "en" : "tr";
const t = STRINGS[lang];
const mode: Mode = document.body.dataset.udfMode === "view" ? "view" : "convert";

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
      <span class="form-value">${t.docTypeValue}</span>
    </div>
    <div class="form-row">
      <span class="form-label">${t.docFile} <span class="req" aria-hidden="true">*</span></span>
      <label class="dropzone" id="dropzone">
        <span class="pdf-icon" aria-hidden="true"><i></i><i></i><i></i><span class="tag">UDF</span></span>
        <span class="dropzone-title">${t.dropTitle}</span>
        <span class="dropzone-hint">${t.dropHint}</span>
        <input type="file" id="file-input" accept=".udf" aria-required="true" hidden />
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

function renderDone(file: File, pdfName: string, pageCount: number, signed: boolean, hasUnknown: boolean): void {
  setStep(3);
  const notes = [signed && t.signed, hasUnknown && t.unknown]
    .filter(Boolean)
    .map((text) => `<div class="notice"><span class="notice-dot" aria-hidden="true">i</span><span>${text}</span></div>`)
    .join("");
  panelState.innerHTML = `
    <div class="notice success">
      <span class="notice-dot" aria-hidden="true">✓</span>
      <span>
        <strong>${mode === "view" ? t.viewDoneTitle : t.convertDoneTitle}</strong>
        <span class="sub">${mode === "view" ? t.viewDoneSub : t.convertDoneSub}</span>
      </span>
    </div>
    ${notes}
    ${detailTable([
      [t.fileName, file.name],
      [t.pages, String(pageCount)],
    ])}
    <div class="actions">
      <a class="${mode === "view" ? "btn-secondary" : "btn-download"}" id="download" href="${activeBlobUrl}" download="${escapeHtml(pdfName)}">${mode === "view" ? t.downloadView : t.downloadConvert}</a>
      <button class="btn-secondary" id="again" type="button">${t.another}</button>
    </div>`;
  document.getElementById("again")!.addEventListener("click", renderIdle);
}

async function open(file: File | undefined | null): Promise<void> {
  if (!file) return;
  await reset();
  const run = runId;
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    renderError(`${t.isPdf} <a href="${t.pdfHome}">${t.isPdfLink}</a>`);
    return;
  }
  renderWorking(file, t.reading);
  try {
    const [{ convertUdf, showPreview }, data] = await Promise.all([import("./udf/browser.js"), file.arrayBuffer()]);
    if (run !== runId) return;
    setStatus(t.building);
    const { doc, pdf } = await convertUdf(data);
    if (run !== runId) return;
    setStatus(t.previewing);
    activeBlobUrl = URL.createObjectURL(new Blob([pdf.slice().buffer], { type: "application/pdf" }));
    previewEl.hidden = false;
    const preview = await showPreview(pdf, previewEl, t.pageLabel);
    if (run !== runId) {
      await preview.destroy();
      return;
    }
    activePreview = preview;
    const pdfName = file.name.replace(/\.udf$/i, "") + ".pdf";
    renderDone(file, pdfName, preview.pageCount, doc.signed, doc.unknownElements.length > 0);
  } catch (e) {
    if (run !== runId) return;
    console.error("[udf]", e);
    const code = (e as { code?: string }).code;
    renderError(code === "not-zip" || code === "no-content" ? t.notUdf : t.failed);
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
