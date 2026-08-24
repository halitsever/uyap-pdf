import "./style.css";

const STRINGS = {
  tr: {
    stepLabel: (n: number) => `Adım ${n} / 3`,
    docType: "Belge türü",
    docTypeValue: "PDF (.pdf), tek dosya",
    docFile: "Evrak dosyası",
    dropTitle: "PDF dosyanızı buraya bırakın",
    dropHint: "veya tıklayıp bilgisayarınızdan seçin",
    fileName: "Dosya adı",
    sizeType: "Boyut ve tür",
    resolution: "Çözünürlük",
    resolutionValue: "200 DPI, sayfa görüntüsü olarak gömülür",
    convert: "UDF'ye çevir",
    cancel: "Vazgeç",
    readyStatus: "Dönüşüm cihazınızda yapılır.",
    working: "Sayfalar işleniyor.",
    workingPage: (n: number, total: number) => `Sayfa ${n} / ${total} işleniyor.`,
    packing: "UDF belgesi oluşturuluyor.",
    doneTitle: "İşlem tamamlandı",
    doneSub: "Belgeniz UYAP Doküman Editörü ile uyumlu UDF formatında oluşturuldu.",
    outLabel: "Oluşan belge",
    srcLabel: "Kaynak dosya",
    download: "UDF dosyasını indir",
    newConversion: "Yeni dönüşüm",
    retry: "Tekrar dene",
    notPdf: "Seçilen dosya PDF değil. Lütfen .pdf uzantılı bir dosya seçin.",
    password: "Bu PDF parola korumalı. Önce korumayı kaldırıp tekrar deneyin.",
    failed: "Dönüşüm başarısız oldu. Dosya bozuk olabilir, lütfen tekrar deneyin.",
  },
  en: {
    stepLabel: (n: number) => `Step ${n} / 3`,
    docType: "Document type",
    docTypeValue: "PDF (.pdf), single file",
    docFile: "Document file",
    dropTitle: "Drop your PDF here",
    dropHint: "or click to choose from your computer",
    fileName: "File name",
    sizeType: "Size and type",
    resolution: "Resolution",
    resolutionValue: "200 DPI, embedded as page images",
    convert: "Convert to UDF",
    cancel: "Cancel",
    readyStatus: "Conversion happens on your device.",
    working: "Processing pages.",
    workingPage: (n: number, total: number) => `Processing page ${n} / ${total}.`,
    packing: "Building the UDF document.",
    doneTitle: "Conversion complete",
    doneSub: "Your document was created in UDF format, compatible with the UYAP Document Editor.",
    outLabel: "Generated document",
    srcLabel: "Source file",
    download: "Download UDF file",
    newConversion: "New conversion",
    retry: "Try again",
    notPdf: "The selected file is not a PDF. Please choose a .pdf file.",
    password: "This PDF is password-protected. Remove the protection and try again.",
    failed: "Conversion failed. The file may be corrupted, please try again.",
  },
};

type Lang = keyof typeof STRINGS;
const lang: Lang = document.documentElement.lang === "en" ? "en" : "tr";
const t = STRINGS[lang];

const panelState = document.getElementById("panel-state")!;
const stepLabel = document.getElementById("step-label")!;

let currentFile: File | null = null;
let activeBlobUrl: string | null = null;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function formatMeta(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return (mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`) + ", PDF";
}

function setStep(n: number): void {
  stepLabel.textContent = t.stepLabel(n);
}

function renderIdle(): void {
  currentFile = null;
  setStep(1);
  panelState.innerHTML = `
    <div class="form-row">
      <span class="form-label">${t.docType} <span class="req" aria-hidden="true">*</span></span>
      <span class="form-value">${t.docTypeValue}</span>
    </div>
    <div class="form-row">
      <span class="form-label">${t.docFile} <span class="req" aria-hidden="true">*</span></span>
      <label class="dropzone" id="dropzone">
        <span class="pdf-icon" aria-hidden="true">
          <i></i><i></i><i></i>
          <span class="tag">PDF</span>
        </span>
        <span class="dropzone-title">${t.dropTitle}</span>
        <span class="dropzone-hint">${t.dropHint}</span>
        <input type="file" id="file-input" accept="application/pdf,.pdf" aria-required="true" hidden />
      </label>
    </div>`;
  wireDropzone();
}

function detailTable(rows: [string, string][]): string {
  const body = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  return `<table class="detail-table"><tbody>${body}</tbody></table>`;
}

function renderReady(file: File, status: string, working: boolean): void {
  setStep(2);
  panelState.innerHTML = `
    ${detailTable([
      [t.fileName, file.name],
      [t.sizeType, formatMeta(file.size)],
      [t.resolution, t.resolutionValue],
    ])}
    <div class="actions">
      <button class="btn-primary" id="convert" type="button" ${working ? "disabled" : ""}>${t.convert}</button>
      <button class="btn-secondary" id="cancel" type="button" ${working ? "disabled" : ""}>${t.cancel}</button>
      <span class="status-text" id="status-text">${escapeHtml(status)}</span>
    </div>`;
  if (!working) {
    document.getElementById("convert")!.addEventListener("click", () => void convert());
    document.getElementById("cancel")!.addEventListener("click", renderIdle);
  }
}

function setStatus(text: string): void {
  const el = document.getElementById("status-text");
  if (el) el.textContent = text;
}

function renderDone(file: File, udfName: string, blobUrl: string): void {
  setStep(3);
  panelState.innerHTML = `
    <div class="notice success">
      <span class="notice-dot" aria-hidden="true">✓</span>
      <span>
        <strong>${t.doneTitle}</strong>
        <span class="sub">${t.doneSub}</span>
      </span>
    </div>
    ${detailTable([
      [t.outLabel, udfName],
      [t.srcLabel, file.name],
    ])}
    <div class="actions">
      <a class="btn-download" id="download" href="${blobUrl}" download="${escapeHtml(udfName)}">${t.download}</a>
      <button class="btn-secondary" id="again" type="button">${t.newConversion}</button>
    </div>`;
  document.getElementById("again")!.addEventListener("click", renderIdle);
}

function renderError(message: string): void {
  setStep(1);
  panelState.innerHTML = `
    <div class="notice error">
      <span class="notice-dot" aria-hidden="true">!</span>
      <span>${message}</span>
    </div>
    <div class="actions">
      <button class="btn-primary" id="retry" type="button">${t.retry}</button>
    </div>`;
  document.getElementById("retry")!.addEventListener("click", renderIdle);
}

function accept(file: File | undefined | null): void {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    renderError(t.notPdf);
    return;
  }
  currentFile = file;
  renderReady(file, t.readyStatus, false);
}

async function convert(): Promise<void> {
  const file = currentFile;
  if (!file) return;
  renderReady(file, t.working, true);

  try {
    const [{ pdfToUdf }, data] = await Promise.all([import("./convert-pdf.js"), file.arrayBuffer()]);
    const udf = await pdfToUdf(data, (n, total) => setStatus(t.workingPage(n, total)));
    setStatus(t.packing);

    if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = URL.createObjectURL(new Blob([udf.slice().buffer], { type: "application/octet-stream" }));
    const udfName = file.name.replace(/\.pdf$/i, "") + ".udf";
    renderDone(file, udfName, activeBlobUrl);
  } catch (e) {
    console.error("[convert]", e);
    const name = e instanceof Error ? e.name : "";
    renderError(name === "PasswordException" ? t.password : t.failed);
  }
}

function wireDropzone(): void {
  const zone = document.getElementById("dropzone");
  const input = document.getElementById("file-input") as HTMLInputElement | null;
  if (!zone || !input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    accept(file);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    accept(e.dataTransfer?.files?.[0]);
  });
}

// The idle state ships in the static HTML; wire it up on load.
wireDropzone();
