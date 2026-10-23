"use client";

import "@mdxeditor/editor/style.css";

import { useRef, useState } from "react";
import {
  $isDirectiveNode,
  AdmonitionDirectiveDescriptor,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  ChangeAdmonitionType,
  ChangeCodeMirrorLanguage,
  codeBlockPlugin,
  codeMirrorPlugin,
  ConditionalContents,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  directivesPlugin,
  headingsPlugin,
  HighlightToggle,
  imagePlugin,
  InsertAdmonition,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  type EditorInFocus,
  type MDXEditorMethods,
} from "@mdxeditor/editor";

import { normalizeTheoryHtml } from "@/lib/lesson-content";
import { uploadImageFile } from "@/lib/image-upload";

// ============================================================
// Визуальный (WYSIWYG) редактор теории урока поверх MDXEditor.
//
// Снаружи - то же, что textarea: принимает markdown-строку и отдаёт
// markdown в onChange. В БД по-прежнему лежит обычный Markdown, ученик
// видит его через <Markdown> (react-markdown) - ничего мигрировать не надо.
//
// Картинки: перетаскивание, Ctrl+V и кнопка тулбара уходят POST-ом в
// /api/admin/upload-image (локальная папка UPLOADS_DIR, отдаётся как
// /media/<имя>), в текст вставляется ссылка.
//
// Импортировать ТОЛЬКО через next/dynamic c ssr: false - редактор живёт
// на Lexical и в серверном рендере падает.
// ============================================================

// Сжатие и загрузка картинок живут в src/lib/image-upload.ts - тот же
// код использует импорт урока из папки.
const uploadImage = uploadImageFile;

// Внутри редактора текст стилизуем так же, как ученик увидит его в
// <Markdown> - WYSIWYG без сюрпризов (Tailwind сбрасывает теги, поэтому явно).
const contentClass =
  "min-h-[260px] p-4 font-medium text-neutral-700 focus:outline-none " +
  "[&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-neutral-700 " +
  "[&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-neutral-700 " +
  "[&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-neutral-700 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_blockquote]:border-l-4 [&_blockquote]:border-green-300 [&_blockquote]:bg-green-50 [&_blockquote]:px-4 [&_blockquote]:py-2 " +
  "[&_a]:font-bold [&_a]:text-sky-500 [&_a]:underline " +
  "[&_mark]:rounded [&_mark]:bg-amber-200 [&_mark]:px-1 [&_mark]:font-bold " +
  "[&_img]:max-w-full [&_img]:rounded-xl";

// Селектор типа рамки показываем только когда курсор внутри admonition:
// безусловный <ChangeAdmonitionType> читает editorInFocus.rootNode и
// падает с "rootNode of null", когда фокус вне рамки (обычный текст).
const ADMONITION_NAMES = new Set(["note", "tip", "danger", "info", "caution"]);
function whenInAdmonition(editor: EditorInFocus | null): boolean {
  const node = editor?.rootNode;
  return $isDirectiveNode(node) && ADMONITION_NAMES.has(node.getMdastNode().name);
}

type TheoryEditorProps = {
  /** Стартовый markdown (читается один раз при монтировании). */
  markdown: string;
  onChange: (markdown: string) => void;
};

export function TheoryEditor({ markdown, onChange }: TheoryEditorProps) {
  // Ошибка парсинга не роняет форму: показываем подсказку, правится в
  // режиме источника (кнопка </> в тулбаре).
  const [parseError, setParseError] = useState<string | null>(null);
  const editorRef = useRef<MDXEditorMethods>(null);

  return (
    <div className="rounded-xl border-2 border-neutral-200 focus-within:border-sky-300">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={(value) => {
          // MDXEditor зовёт onChange прямо в первом коммите Lexical
          // (нормализует стартовый markdown) - setState родителя в этот
          // момент падает с "update on component that hasn't mounted".
          // Откладываем на микротаск: коммит завершится, компонент
          // смонтируется, значение останется тем же.
          queueMicrotask(() => {
            setParseError(null);
            onChange(value);
          });
        }}
        onError={({ error, source }) => {
          // Гайд, вставленный из DOCX/HTML-экспорта, содержит сырой HTML
          // (<figure><img>…</figure>, <div class="fact">), который парсер
          // JSX не принимает. Переводим его в наш markdown и перечитываем;
          // подсказку показываем, только если и это не помогло.
          const normalized = normalizeTheoryHtml(source);
          if (normalized !== source) {
            queueMicrotask(() => {
              editorRef.current?.setMarkdown(normalized);
              onChange(normalized);
            });
            return;
          }
          setParseError(error);
        }}
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
          // Цветные рамки вставляются кнопкой тулбара и рисуются прямо
          // в визуальном режиме. В markdown уходят как `:::info`/`:::note`/
          // `:::caution`, а <Markdown> у ученика превращает их в callout.
          directivesPlugin({
            directiveDescriptors: [AdmonitionDirectiveDescriptor],
          }),
          // GFM-таблицы из справочников: без плагина редактор показал бы
          // их сырым текстом и при сохранении потерял разметку.
          tablePlugin(),
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
                          <HighlightToggle />
                          <ConditionalContents
                            options={[
                              {
                                when: whenInAdmonition,
                                contents: () => <ChangeAdmonitionType />,
                              },
                              { fallback: () => <BlockTypeSelect /> },
                            ]}
                          />
                          <ListsToggle options={["bullet", "number"]} />
                          <CreateLink />
                          <InsertImage />
                          <InsertCodeBlock />
                          <InsertThematicBreak />
                          <InsertAdmonition />
                          <InsertTable />
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
