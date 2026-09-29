import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/server-guard";
import { imageExtension, IMAGE_TYPES, MAX_IMAGE_BYTES, localImagePath, uploadsDirectory } from "@/lib/image-files";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let userId: string;
  try { userId = await requireAdmin(); }
  catch { return Response.json({ error: "Нет доступа" }, { status: 403 }); }
  if (!rateLimit(`upload:${userId}`, 30, 60_000)) {
    return Response.json({ error: "Слишком много загрузок. Подожди минуту." }, { status: 429 });
  }
  // Bound multipart bytes before parsing; a forged Content-Length cannot bypass it.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Нет файла" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES + 64 * 1024) {
        await reader.cancel();
        return Response.json({ error: "Картинка больше 5 МБ" }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = body.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Нет файла" }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return Response.json({ error: "Картинка больше 5 МБ" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = imageExtension(bytes);
    if (!ext || file.type !== IMAGE_TYPES[ext]) return Response.json({ error: "Можно только PNG, JPEG, GIF или WebP. Формат файла должен соответствовать содержимому." }, { status: 400 });
    const name = `${Date.now()}-${randomUUID()}.${ext}`;
    // Хранилище одно — локальная файловая система сервера (UPLOADS_DIR);
    // файлы отдаёт /media/[name].
    await mkdir(uploadsDirectory(), { recursive: true });
    await writeFile(localImagePath(name)!, bytes, { flag: "wx", mode: 0o640 });
    return Response.json({ url: `/media/${name}` });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: "Не удалось прочитать загрузку." }, { status: 400 });
    return Response.json({ error: "Не удалось сохранить картинку. Проверьте UPLOADS_DIR и свободное место." }, { status: 500 });
  }
}
