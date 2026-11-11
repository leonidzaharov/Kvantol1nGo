"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { isExternalImageUrl, listTheoryImages, uploadRelativeTheoryImages } from "@/lib/lesson-import";
import { uploadImageFile } from "@/lib/image-upload";

type Props = {
  markdown: string;
  getMarkdown: () => string;
  onReplace: (replacements: Map<string, string>) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function TheoryImages({ markdown, getMarkdown, onReplace, onBusyChange }: Props) {
  const images = listTheoryImages(markdown);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ source: string; file: File; message: string } | null>(null);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const hasLocalImages = images.some((image) => !isExternalImageUrl(image.source));

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNote(null);
    onBusyChange?.(true);
    try { await action(); }
    finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      onBusyChange?.(false);
    }
  }
  async function replace(source: string, file: File) {
    await run(async () => {
      try {
        const url = await uploadImageFile(file);
        if (!mounted.current) return;
        onReplace(new Map([[source, url]]));
        setFailed(null);
        setNote("Картинка загружена. Ссылка обновлена на прежнем месте. Сохрани урок.");
      } catch (error) {
        if (mounted.current) setFailed({ source, file, message: error instanceof Error ? error.message : "Не удалось загрузить картинку" });
      }
    });
  }
  async function repair(files: File[]) {
    await run(async () => {
      try {
        const result = await uploadRelativeTheoryImages(getMarkdown(), files, uploadImageFile);
        if (!mounted.current) return;
        onReplace(result.replacements);
        setNote(`Загружено ${result.done} из ${result.total}.` + (result.missing.length ? ` Не удалось загрузить: ${result.missing.join(", ")}. Выбери файл у нужной картинки или повтори выбор папки.` : " Ссылки обновлены. Сохрани урок."));
      } catch (error) {
        if (mounted.current) setNote(error instanceof Error ? error.message : "Не удалось загрузить картинки");
      }
    });
  }
  if (!images.length) return null;
  return (
    <section aria-label="Картинки урока" className="space-y-3 border-t-2 border-neutral-200 p-3 text-sm text-neutral-700">
      <h3 className="font-bold">Картинки урока ({images.length})</h3>
      <p>Если картинка не открылась, выбери её файл заново. Ссылка заменится в том же месте текста, подпись сохранится.</p>
      {hasLocalImages && <label className="block rounded-lg border border-neutral-200 p-3 font-bold">
        Загрузить недостающие картинки из папки
        <input type="file" multiple disabled={busy}
          // @ts-expect-error Directory selection is supported by the browser.
          webkitdirectory="" className="mt-2 block max-w-full font-normal"
          onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void repair(files); }} />
        <span className="mt-1 block font-normal text-neutral-500">Выбери исходную папку с картинками. Теория и задания сохранятся, уже загруженные картинки повторно не отправляются.</span>
      </label>}
      {note && <p role="status" className="break-words">{note}</p>}
      {busy && <p role="status">Загружаем картинки...</p>}
      <ol className="max-h-80 space-y-3 overflow-y-auto">
        {images.map((image, index) => <li key={image.source} className="flex items-start gap-3 rounded-lg bg-neutral-50 p-3">
          {isExternalImageUrl(image.source) && !broken.has(image.source) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.source} alt="" loading="lazy" className="h-14 w-16 shrink-0 rounded border border-neutral-200 object-contain"
              onError={() => setBroken((previous) => new Set(previous).add(image.source))} />
          ) : <span className="flex h-14 w-16 shrink-0 items-center justify-center rounded border border-neutral-200 text-center text-xs">Нужен файл</span>}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-bold">{index + 1}. {image.alt || "Без подписи"}{image.count > 1 ? ` (мест в тексте: ${image.count})` : ""}</p>
            <p className="break-all text-neutral-500">{image.source}</p>
            {broken.has(image.source) && <p>Файл недоступен. Выбери картинку заново, чтобы восстановить её.</p>}
            <label className="block font-bold">Заменить файл
              <input aria-label={`Заменить картинку ${index + 1}`} type="file" accept="image/*" disabled={busy} className="mt-1 block max-w-full font-normal"
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void replace(image.source, file); }} />
            </label>
            {failed?.source === image.source && <div className="space-y-2 text-rose-600">
              <p role="alert">{failed.message}</p>
              <Button type="button" variant="secondaryOutline" size="sm" disabled={busy} onClick={() => void replace(failed.source, failed.file)}>Повторить загрузку</Button>
            </div>}
          </div>
        </li>)}
      </ol>
    </section>
  );
}
