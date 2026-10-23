// Загрузка картинок в /api/admin/upload-image (общая для редактора
// и импорта уроков из папки). Хранилище - локальная папка UPLOADS_DIR
// на сервере, файлы отдаются как /media/<имя>.
//
// Файлы хранятся как есть (сжатия на сервере нет), поэтому жмём картинку
// в браузере ДО загрузки: ширина до 1600px, перекодировка в WebP.
// Скриншот с 2–4 МБ ужимается до ~100–200 КБ.
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  // GIF не трогаем: canvas оставит только первый кадр, анимация пропадёт.
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    // WebP не вышел или получился крупнее оригинала - шлём оригинал.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "image.webp", { type: "image/webp" });
  } catch {
    return file; // битый/экзотический файл - пусть сервер решает
  }
}

export async function uploadImageFile(image: File): Promise<string> {
  const body = new FormData();
  body.append("file", await compressImage(image));
  const res = await fetch("/api/admin/upload-image", { method: "POST", body });
  const json: unknown = await res.json().catch(() => null);
  const parsed = (json ?? {}) as { url?: string; error?: string };
  if (!res.ok || !parsed.url) {
    throw new Error(parsed.error ?? "Не удалось загрузить картинку");
  }
  return parsed.url;
}
