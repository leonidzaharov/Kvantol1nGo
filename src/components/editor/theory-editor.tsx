"use client";

import "@mdxeditor/editor/style.css";

import { useState } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeCodeMirrorLanguage,
  codeBlockPlugin,
  codeMirrorPlugin,
  ConditionalContents,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";

// ============================================================
// Визуальный (WYSIWYG) редактор теории урока поверх MDXEditor.
//
// Снаружи — то же, что textarea: принимает markdown-строку и отдаёт
// markdown в onChange. В БД по-прежнему лежит обычный Markdown, ученик
// видит его через <Markdown> (react-markdown) — ничего мигрировать не надо.
//
// Картинки: перетаскивание, Ctrl+V и кнопка тулбара уходят POST-ом в
// /api/admin/upload-image (Supabase Storage), в текст вставляется ссылка.
//
// Импортировать ТОЛЬКО через next/dynamic c ssr: false — редактор живёт
// на Lexical и в серверном рендере падает.
// ============================================================

// Supabase хранит файлы как есть (сжатие «на лету» — только на платном
// тарифе), поэтому жмём картинку в браузере ДО загрузки: ширина до 1600px,
// перекодировка в WebP. Скриншот с 2–4 МБ ужимается до ~100–200 КБ.
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 0.8;

async function compressImage(file: File): Promise<File> {
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
    // WebP не вышел или получился крупнее оригинала — шлём оригинал.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "image.webp", { type: "image/webp" });
  } catch {
    return file; // битый/экзотический файл — пусть сервер решает
  }
}

async function uploadImage(image: File): Promise<string> {
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

// Внутри редактора текст стилизуем так же, как ученик увидит его в
// <Markdown> — WYSIWYG без сюрпризов (Tailwind сбрасывает теги, поэтому явно).
const contentClass =
  "min-h-[260px] p-4 font-medium text-neutral-700 focus:outline-none " +
  "[&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-neutral-700 " +
  "[&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-neutral-700 " +
  "[&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-neutral-700 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_blockquote]:border-l-4 [&_blockquote]:border-green-300 [&_blockquote]:bg-green-50 [&_blockquote]:px-4 [&_blockquote]:py-2 " +
  "[&_a]:font-bold [&_a]:text-sky-500 [&_a]:underline " +
  "[&_img]:max-w-full [&_img]:rounded-xl";

type TheoryEditorProps = {
  /** Стартовый markdown (читается один раз при монтировании). */
  markdown: string;
  onChange: (markdown: string) => void;
};

export function TheoryEditor({ markdown, onChange }: TheoryEditorProps) {
  // Ошибка парсинга не роняет форму: показываем подсказку, правится в
  // режиме источника (кнопка </> в тулбаре).
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border-2 border-neutral-200 focus-within:border-sky-300">
      <MDXEditor
        markdown={markdown}
        onChange={(value) => {
          setParseError(null);
          onChange(value);
        }}
        onError={({ error }) => setParseError(error)}
        contentEditableClassName={contentClass}
        placeholder="Расскажи тему урока: текст, картинки, примеры кода…"
        plugins={[
          headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({ imageUploadHandler: uploadImage }),
          codeBlockPlugin({ defaultCodeBlockLanguage: "python" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              python: "Python",
              js: "JavaScript",
              html: "HTML",
              "": "Просто текст",
            },
          }),
          diffSourcePlugin({ viewMode: "rich-text" }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <ConditionalContents
                  options={[
                    {
                      when: (editor) => editor?.editorType === "codeblock",
                      contents: () => <ChangeCodeMirrorLanguage />,
                    },
                    {
                      fallback: () => (
                        <>
                          <UndoRedo />
                          <BoldItalicUnderlineToggles
                            options={["Bold", "Italic"]}
                          />
                          <BlockTypeSelect />
                          <ListsToggle options={["bullet", "number"]} />
                          <CreateLink />
                          <InsertImage />
                          <InsertCodeBlock />
                          <InsertThematicBreak />
                        </>
                      ),
                    },
                  ]}
                />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
      {parseError && (
        <p className="border-t-2 border-neutral-200 bg-rose-50 p-3 text-sm font-medium text-rose-600">
          Не смог разобрать разметку: {parseError}. Переключись в режим
          источника (кнопка со скобками в тулбаре) и поправь текст.
        </p>
      )}
    </div>
  );
}
