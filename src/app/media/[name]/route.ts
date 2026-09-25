import { readFile } from "node:fs/promises";
import { IMAGE_TYPES, localImagePath } from "@/lib/image-files";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.STORAGE_DRIVER !== "local") return new Response(null, { status: 404 });
  const { name } = await params;
  const file = localImagePath(name);
  if (!file) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(file);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": IMAGE_TYPES[name.split(".").at(-1)!],
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404 });
    return new Response(null, { status: 500 });
  }
}
