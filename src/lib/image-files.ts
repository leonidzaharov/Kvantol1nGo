import path from "node:path";

export const IMAGE_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageExtension(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
  if (["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6))) return "gif";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export function uploadsDirectory(): string {
  const directory = process.env.UPLOADS_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error("UPLOADS_DIR must be absolute");
  return path.resolve(directory);
}

export function localImagePath(name: string): string | null {
  // One generated filename, no subdirectories or user-controlled paths.
  if (!/^[a-zA-Z0-9_-]{1,100}\.(png|jpg|gif|webp)$/.test(name)) return null;
  return path.join(uploadsDirectory(), name);
}
