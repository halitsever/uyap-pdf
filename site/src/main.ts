import "./style.css";

const STRINGS = {
  tr: {
    dropTitle: "PDF dosyanızı buraya bırakın",
    dropHint: "veya tıklayıp seçin — en fazla tek dosya",
    reading: "Dosya okunuyor…",
    page: (n: number, total: number) => `Sayfa ${n}/${total} işleniyor…`,
    packing: "UDF belgesi oluşturuluyor…",
    stampSmall: "UYAP uyumlu",
    download: "UDF'yi indir",
    again: "Başka bir PDF çevir",
    notPdf: "Bu dosya bir PDF değil. Lütfen .pdf uzantılı bir dosya seçin.",
    password: "Bu PDF parola korumalı. Önce korumayı kaldırıp tekrar deneyin.",
    failed: "Dönüşüm başarısız oldu. Dosya bozuk olabilir; lütfen tekrar deneyin.",
    retry: "Tekrar dene",
  },
  en: {
    dropTitle: "Drop your PDF here",
    dropHint: "or click to choose a file — one file at a time",
    reading: "Reading file…",
    page: (n: number, total: number) => `Processing page ${n}/${total}…`,
    packing: "Building the UDF document…",
    stampSmall: "UYAP compatible",
    download: "Download UDF",
    again: "Convert another PDF",
    notPdf: "That file is not a PDF. Please choose a .pdf file.",
    password: "This PDF is password-protected. Remove the protection and try again.",
    failed: "Conversion failed. The file may be corrupted; please try again.",
    retry: "Try again",
  },
};

type Lang = keyof typeof STRINGS;
const lang: Lang = document.documentElement.lang === "en" ? "en" : "tr";
const t = STRINGS[lang];

const sheet = document.getElementById("tool")!;
const input = document.getElementById("file-input") as HTMLInputElement;
sheet.setAttribute("aria-live", "polite");

function render(html: string): void {
  for (const el of Array.from(sheet.children)) {
    if (el !== input) el.remove();
  }
  input.insertAdjacentHTML("beforebegin", html);
}

function renderIdle(): void {
  render(`
    <button class="dropzone" id="dropzone" type="button">
      <span class="icon" aria-hidden="true">⚖</span>
      <strong>${t.dropTitle}</strong>
      <span class="hint">${t.dropHint}</span>
    </button>`);
  document.getElementById("dropzone")!.addEventListener("click", () => input.click());
}

function renderProgress(fileName: string, status: string, fraction: number): void {
  render(`
    <div>
      <p class="filemeta">${escapeHtml(fileName)}</p>
      <p class="status">${status}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round(fraction * 100)}">
        <div class="bar" style="width:${fraction * 100}%"></div>
      </div>
    </div>`);
}

function renderDone(udfName: string, blobUrl: string): void {
  render(`
    <div>
      <div class="stamp" aria-hidden="true">
        <span class="big">UDF</span>
        <span class="small">${t.stampSmall}</span>
      </div>
      <div class="done-actions">
        <a class="btn" href="${blobUrl}" download="${escapeHtml(udfName)}">${t.download}</a>
        <button class="btn-ghost" id="again" type="button">${t.again}</button>
      </div>
    </div>`);
  document.getElementById("again")!.addEventListener("click", renderIdle);
}

function renderError(message: string): void {
  render(`
    <div>
      <p class="error">${message}</p>
      <div class="done-actions">
        <button class="btn" id="retry" type="button">${t.retry}</button>
      </div>
    </div>`);
  document.getElementById("retry")!.addEventListener("click", renderIdle);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

let activeBlobUrl: string | null = null;

async function convert(file: File): Promise<void> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    renderError(t.notPdf);
    return;
  }

  try {
    renderProgress(file.name, t.reading, 0);
    const [{ pdfToUdf }, data] = await Promise.all([import("./convert-pdf.js"), file.arrayBuffer()]);
    const udf = await pdfToUdf(data, (n, total) =>
      renderProgress(file.name, t.page(n, total), (n - 1) / total),
    );
    renderProgress(file.name, t.packing, 0.95);

    if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = URL.createObjectURL(new Blob([udf.slice().buffer], { type: "application/octet-stream" }));
    const udfName = file.name.replace(/\.pdf$/i, "") + ".udf";
    renderDone(udfName, activeBlobUrl);
  } catch (e) {
    console.error("[convert]", e);
    const name = e instanceof Error ? e.name : "";
    renderError(name === "PasswordException" ? t.password : t.failed);
  }
}

input.addEventListener("change", () => {
  const file = input.files?.[0];
  input.value = "";
  if (file) void convert(file);
});

// The idle button is already in the static HTML; wire it up on load.
document.getElementById("dropzone")!.addEventListener("click", () => input.click());

sheet.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.getElementById("dropzone")?.classList.add("dragover");
});
sheet.addEventListener("dragleave", () => {
  document.getElementById("dropzone")?.classList.remove("dragover");
});
sheet.addEventListener("drop", (e) => {
  e.preventDefault();
  document.getElementById("dropzone")?.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) void convert(file);
});
