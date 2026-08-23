import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Full install path; the thin `soffice` wrapper on PATH may fail to load DOCX (macOS). */
const MACOS_LIBREOFFICE_SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice";

/** `soffice.com` comes first: `soffice.exe` detaches and may return before the conversion ends. */
const WINDOWS_LIBREOFFICE_CANDIDATES = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.com",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
];

let cachedLibreOfficeBin: string | null | undefined;

export async function resolveLibreOfficeBin(): Promise<string | null> {
  if (cachedLibreOfficeBin !== undefined) {
    return cachedLibreOfficeBin;
  }
  const envPath = process.env.LIBREOFFICE_PATH?.trim();
  const candidates: string[] = [];
  if (envPath) candidates.push(envPath);
  if (process.platform === "darwin") {
    candidates.push(MACOS_LIBREOFFICE_SOFFICE);
  }
  if (process.platform === "win32") {
    candidates.push(...WINDOWS_LIBREOFFICE_CANDIDATES);
  }
  candidates.push("libreoffice", "soffice");
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 8000, maxBuffer: 1024 * 1024 });
      cachedLibreOfficeBin = cmd;
      return cmd;
    } catch {
      /* try next */
    }
  }
  cachedLibreOfficeBin = null;
  return null;
}

export function bufferLooksLikeDocxZip(docx: Buffer): boolean {
  if (docx.length < 64) return false;
  return docx[0] === 0x50 && docx[1] === 0x4b;
}

export type LoExecResult = { stderr: string };

export async function runLibreofficeConvert(
  bin: string,
  workDir: string,
  inputPath: string,
  userInstallHref: string,
  convertToArg: string,
): Promise<LoExecResult> {
  const result = await execFileAsync(
    bin,
    [
      "--headless",
      "--norestore",
      "--nologo",
      "--invisible",
      `-env:UserInstallation=${userInstallHref}`,
      "--convert-to",
      convertToArg,
      "--outdir",
      workDir,
      inputPath,
    ],
    {
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    },
  );
  return { stderr: String((result as { stderr?: string }).stderr ?? "") };
}
