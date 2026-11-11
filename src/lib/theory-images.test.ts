import { describe, expect, it, vi } from "vitest";

import { listTheoryImages, rewriteImageLinks, uploadRelativeTheoryImages } from "./lesson-import";

function imageFile(name: string, relative: string) {
  const file = new File(["image"], name, { type: "image/png" });
  Object.defineProperty(file, "webkitRelativePath", { value: relative });
  return file;
}

describe("восстановление изображений текущей теории", () => {
  it("показывает одну строку на источник и сохраняет подписи и повторения", () => {
    const markdown = '![Первый кадр](images/a.png "Схема")\n![Ещё раз](images/a.png)\n![Другой](</media/ready.png>)';
    expect(listTheoryImages(markdown)).toEqual([
      { source: "images/a.png", alt: "Первый кадр", count: 2 },
      { source: "/media/ready.png", alt: "Другой", count: 1 },
    ]);
    expect(rewriteImageLinks(markdown, new Map([["images/a.png", "/media/fixed.png"]])))
      .toBe('![Первый кадр](/media/fixed.png "Схема")\n![Ещё раз](/media/fixed.png)\n![Другой](</media/ready.png>)');
  });

  it("после частичного сбоя повторно отправляет только незагруженный файл", async () => {
    const markdown = '# Мои правки\n\n![A](images/a.png)\n![B](images/b.png)\n![Готово](/media/ready.png)\nТекст сохранён.';
    const files = [imageFile("a.png", "Урок/images/a.png"), imageFile("b.png", "Урок/images/b.png")];
    const upload = vi.fn().mockResolvedValueOnce("/media/a.png").mockRejectedValueOnce(new Error("Нет сети"));
    const first = await uploadRelativeTheoryImages(markdown, files, upload);
    expect(first).toMatchObject({ done: 1, total: 2, missing: ["images/b.png (Нет сети)"] });
    const partial = rewriteImageLinks(markdown, first.replacements);
    const retry = vi.fn().mockResolvedValue("/media/b.png");
    const second = await uploadRelativeTheoryImages(partial, files, retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith(files[1]);
    expect(rewriteImageLinks(partial, second.replacements)).toBe(markdown.replace("images/a.png", "/media/a.png").replace("images/b.png", "/media/b.png"));
  });

  it("отсутствующий файл не стирает ссылку и не загружает посторонние картинки", async () => {
    const markdown = "![Искомый](images/missing.png)";
    const upload = vi.fn();
    const result = await uploadRelativeTheoryImages(markdown, [imageFile("other.png", "Картинки/other.png")], upload);
    expect(result.missing).toEqual(["images/missing.png"]);
    expect(upload).not.toHaveBeenCalled();
    expect(rewriteImageLinks(markdown, result.replacements)).toBe(markdown);
  });
});
