// ============================================================
// Импорт урока из папки: наставник выбирает папку с .md-гайдом и
// картинками (как присылают собранные комплекты), браузер находит
// markdown, выгружает все картинки с относительными путями через
// обычный upload и подставляет адреса /media/<имя>.
//
// Чистые функции (разбор ссылок, сопоставление путей) покрыты
// юнит-тестами; браузерная часть - svgToPngFile и сама загрузка.
// ============================================================

import { normalizeTheoryHtml } from "@/lib/lesson-content";
import { parseLessonMarkdown, type LessonQuestionsImport } from "@/lib/lesson-document";

// Ссылка на картинку в markdown: ![alt](url) - извлекаем alt и url.
// url бывает в угловых скобках, тогда внутри допускаются пробелы.
const IMAGE_LINK_RE =
  /!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s"']+))\s*(?:"[^"]*")?\s*\)/g;

/** Пути, которые уже загружены или внешние - трогать не нужно. */
export function isExternalImageUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url) || url.startsWith("/") || url.startsWith("data:");
}

function decodeUrl(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // битый процент-энкодинг - ищем как есть
  }
}

/** Список относительных путей картинок в тексте (без дублей, в порядке появления). */
export function extractRelativeImagePaths(markdown: string): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const match of markdown.matchAll(IMAGE_LINK_RE)) {
    const url = decodeUrl(match[2] ?? match[3] ?? "");
    if (!url || isExternalImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    paths.push(url);
  }
  return paths;
}

/**
 * Подменяет относительные ссылки картинок на адреса из map (например,
 * assets/image5.png → /media/123.webp). Ссылки вне map не трогает,
 * alt и остальной текст сохраняются.
 */
export function rewriteImageLinks(
  markdown: string,
  urlMap: Map<string, string>,
): string {
  return markdown.replace(
    IMAGE_LINK_RE,
    (all, alt: string, bracketed: string | undefined, bare: string | undefined) => {
      const url = decodeUrl(bracketed ?? bare ?? "");
      const uploaded = urlMap.get(url);
      return uploaded ? `![${alt}](${uploaded})` : all;
    },
  );
}

/** Уроки в комплектах обычно один .md; если их несколько, берём с наибольшим числом картинок. */
export async function pickMarkdownFile(files: File[]): Promise<File | null> {
  const mdFiles = files.filter((f) => /\.(?:md|markdown)$/i.test(f.name));
  if (mdFiles.length === 0) return null;
  let best: File | null = null;
  let bestCount = -1;
  for (const file of mdFiles) {
    const text = await file.text().catch(() => "");
    const count = extractRelativeImagePaths(text).length;
    if (count > bestCount) {
      best = file;
      bestCount = count;
    }
  }
  return best;
}

/** Нормализуем путь к виду a/b/c.png: прямые слэши, нижний регистр, без ./ и ..-шагов. */
export function normalizePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/").toLowerCase();
}

// Индекс файлов папки: полный путь внутри папки и имя файла → File.
// webkitRelativePath выглядит как «комплект/assets/image5.png».
export type FileIndex = {
  byFullPath: Map<string, File>;
  byBasename: Map<string, File[]>;
};

export function buildFileIndex(files: File[]): FileIndex {
  const byFullPath = new Map<string, File>();
  const byBasename = new Map<string, File[]>();
  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const normalized = normalizePath(relative);
    // Первый компонент - имя самой папки, сравнивать пути удобнее без него.
    const withoutRoot = normalized.split("/").slice(1).join("/") || normalized;
    byFullPath.set(withoutRoot, file);
    byFullPath.set(normalized, file);
    const base = normalized.split("/").pop() ?? normalized;
    const list = byBasename.get(base) ?? [];
    list.push(file);
    byBasename.set(base, list);
  }
  return { byFullPath, byBasename };
}

/** Директория .md внутри папки ("" если лежит в корне). */
export function directoryOf(file: File): string {
  const normalized = normalizePath(file.webkitRelativePath || file.name);
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

/** Ищет файл для относительной ссылки из markdown. */
export function resolveImageFile(
  linkPath: string,
  mdDir: string,
  index: FileIndex,
): File | undefined {
  const normalized = normalizePath(linkPath);
  const joined = normalizePath(`${mdDir}/${decodeUrl(linkPath)}`);
  const direct = index.byFullPath.get(joined) ?? index.byFullPath.get(normalized);
  if (direct) return direct;
  // Запасной вариант: совпадение по имени файла, только если оно единственное.
  const base = normalized.split("/").pop() ?? normalized;
  const candidates = index.byBasename.get(base) ?? [];
  return candidates.length === 1 ? candidates[0] : undefined;
}

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp)$/i;
const SVG_EXT_RE = /\.svg$/i;

/** Файл-картинка, которую принимает загрузчик (SVG конвертируем отдельно). */
export function isUploadableImage(file: File): boolean {
  return IMAGE_EXT_RE.test(file.name) || SVG_EXT_RE.test(file.name);
}

/**
 * SVG загрузчик не принимает (в разметке может жить скрипт). Переводим в
 * PNG на canvas: размер берём из самого SVG (или по умолчанию 1024).
 */
export async function svgToPngFile(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("SVG не открылся как картинка"));
      img.src = url;
    });
    const width = image.naturalWidth || 1024;
    const height = image.naturalHeight || 1024;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Не удалось отрисовать SVG");
    const name = file.name.replace(SVG_EXT_RE, ".png");
    return new File([blob], name, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type TheoryImportProgress = { done: number; total: number; note: string };

/** Читает комплект и загружает только картинки, на которые ссылается теория. */
export async function importTheoryFolder(
  files: File[],
  upload: (file: File) => Promise<string>,
  onProgress: (progress: TheoryImportProgress) => void = () => {},
): Promise<{ markdown: string; missing: string[]; done: number; total: number; questionImport?: LessonQuestionsImport }> {
  const md = await pickMarkdownFile(files);
  if (!md) throw new Error("В папке нет файла .md");
  // Parse before uploading: broken commands must not partially change editor data or upload assets.
  const parsed = parseLessonMarkdown(await md.text());
  const text = normalizeTheoryHtml(parsed.theory);
  const links = extractRelativeImagePaths(text);
  const index = buildFileIndex(files);
  const mdDir = directoryOf(md);
  const missing: string[] = [];
  const urlMap = new Map<string, string>();
  const byFile = new Map<File, string>();
  let done = 0;
  onProgress({ done, total: links.length, note: `Гайд: ${md.name}` });
  for (const link of links) {
    const file = resolveImageFile(link, mdDir, index);
    if (!file) {
      missing.push(link);
      continue;
    }
    try {
      let url = byFile.get(file);
      if (!url) {
        const uploadable = SVG_EXT_RE.test(file.name) ? await svgToPngFile(file) : file;
        url = await upload(uploadable);
        byFile.set(file, url);
      }
      urlMap.set(link, url);
      done += 1;
      onProgress({ done, total: links.length, note: `Гайд: ${md.name}` });
    } catch (error) {
      missing.push(`${link} (${error instanceof Error ? error.message : "ошибка загрузки"})`);
    }
  }
  return {
    markdown: rewriteImageLinks(text, urlMap), missing, done, total: links.length,
    ...(parsed.questionImport === null ? {} : { questionImport: parsed.questionImport }),
  };
}
