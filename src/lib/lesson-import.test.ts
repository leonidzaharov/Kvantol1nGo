import { describe, expect, it, vi } from "vitest";

import {
  buildFileIndex,
  directoryOf,
  extractRelativeImagePaths,
  isExternalImageUrl,
  importTheoryFolder,
  normalizePath,
  resolveImageFile,
  rewriteImageLinks,
} from "@/lib/lesson-import";

function fakeFile(name: string, relative = name): File {
  const file = new File(["x"], name);
  Object.defineProperty(file, "webkitRelativePath", { value: relative });
  return file;
}

describe("extractRelativeImagePaths", () => {
  it("collects relative image urls in order without duplicates", () => {
    const md = "![](assets/a.png) ![](assets/b.png) ![x](assets/a.png)";
    expect(extractRelativeImagePaths(md)).toEqual([
      "assets/a.png",
      "assets/b.png",
    ]);
  });

  it("skips external and already-uploaded urls", () => {
    const md =
      "![](https://x.ru/a.png) ![](//x.ru/b.png) ![](/media/c.webp) ![](data:image/png;base64,AA) ![](assets/d.png)";
    expect(extractRelativeImagePaths(md)).toEqual(["assets/d.png"]);
  });

  it("decodes percent-encoded paths", () => {
    expect(
      extractRelativeImagePaths("![](assets/%D0%BA%D0%B0%D1%80%D1%82.png)"),
    ).toEqual(["assets/карт.png"]);
  });

  it("handles angle-bracket urls and titles", () => {
    const md = '![a](<assets/my img.png> "title")';
    expect(extractRelativeImagePaths(md)).toEqual(["assets/my img.png"]);
  });
});

describe("isExternalImageUrl", () => {
  it("treats http, protocol-relative, root-relative and data urls as external", () => {
    for (const url of [
      "https://a/b.png",
      "http://a/b.png",
      "//a/b.png",
      "/media/x.webp",
      "data:image/png;base64,AA",
    ]) {
      expect(isExternalImageUrl(url)).toBe(true);
    }
    expect(isExternalImageUrl("assets/a.png")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("collapses ./ and .. and backslashes", () => {
    expect(normalizePath("./a\\b/../c.png")).toBe("a/c.png");
    expect(normalizePath("a//b.png")).toBe("a/b.png");
  });
});

describe("resolveImageFile", () => {
  const files = [
    fakeFile("guide.md", "pack/guide.md"),
    fakeFile("image5.png", "pack/assets/image5.png"),
    fakeFile("readme.md", "pack/readme.md"),
    fakeFile("other.png", "pack/deep/other.png"),
  ];
  const index = buildFileIndex(files);

  it("rewriteImageLinks swaps only mapped urls and keeps alt", () => {
    const map = new Map([["assets/image5.png", "/media/x.webp"]]);
    const md =
      "![скрин](assets/image5.png) ![](assets/other.png) ![](media/x.webp)";
    expect(rewriteImageLinks(md, map)).toBe(
      "![скрин](/media/x.webp) ![](assets/other.png) ![](media/x.webp)",
    );
  });

  it("resolves link relative to the markdown file directory", () => {
    const md = files[0];
    expect(
      resolveImageFile("assets/image5.png", directoryOf(md), index),
    ).toBe(files[1]);
  });

  it("falls back to unique basename match", () => {
    const md = files[0];
    expect(resolveImageFile("other.png", directoryOf(md), index)).toBe(files[3]);
  });

  it("returns undefined for ambiguous basename", () => {
    const same = fakeFile("dup.png", "pack/a/dup.png");
    const same2 = fakeFile("dup.png", "pack/b/dup.png");
    const idx = buildFileIndex([...files, same, same2]);
    expect(resolveImageFile("dup.png", "", idx)).toBeUndefined();
    expect(resolveImageFile("a/dup.png", "", idx)).toBe(same);
  });

  it("resolves parent directories before normalizing the link", () => {
    const expected = fakeFile("same.png", "pack/assets/same.png");
    const wrong = fakeFile("same.png", "pack/guide/assets/same.png");
    const idx = buildFileIndex([expected, wrong]);
    expect(resolveImageFile("../assets/same.png", "pack/guide", idx)).toBe(expected);
  });
});

describe("importTheoryFolder", () => {
  function markdown(text: string, relative = "pack/guide.md") {
    const file = new File([text], relative.split("/").pop()!);
    Object.defineProperty(file, "webkitRelativePath", { value: relative });
    return file;
  }

  it("selects the illustrated guide and uploads each referenced file once", async () => {
    const upload = vi.fn().mockResolvedValue("/media/upload.webp");
    const result = await importTheoryFolder([
      markdown("Как добавить урок", "pack/README.md"),
      markdown("# Урок\n![a](assets/a.png) ![b](./assets/a.png)"),
      fakeFile("a.png", "pack/assets/a.png"),
      fakeFile("unused.png", "pack/assets/unused.png"),
    ], upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.markdown).toBe("# Урок\n![a](/media/upload.webp) ![b](/media/upload.webp)");
    expect(result).toMatchObject({ done: 2, total: 2, missing: [] });
  });

  it("reports missing files and failed uploads while keeping successful links", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error("Сеть недоступна"))
      .mockResolvedValueOnce("/media/b.webp");
    const result = await importTheoryFolder([
      markdown("![](absent.png) ![](a.png) ![](b.png)"),
      fakeFile("a.png", "pack/a.png"), fakeFile("b.png", "pack/b.png"),
    ], upload);
    expect(result).toMatchObject({ done: 1, total: 3,
      missing: ["absent.png", "a.png (Сеть недоступна)"] });
    expect(result.markdown).toBe("![](absent.png) ![](a.png) ![](/media/b.webp)");
  });

  it("keeps uploaded and remote images without uploading files again", async () => {
    const upload = vi.fn();
    const text = "![a](/media/a.webp) ![b](https://example.org/b.png)";
    const result = await importTheoryFolder([markdown(text)], upload);
    expect(upload).not.toHaveBeenCalled();
    expect(result).toMatchObject({ markdown: text, done: 0, total: 0, missing: [] });
  });

  it("rejects a folder without markdown", async () => {
    await expect(importTheoryFolder([fakeFile("a.png")], vi.fn()))
      .rejects.toThrow("В папке нет файла .md");
  });
});
