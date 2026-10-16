import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Отрисовка markdown-теории урока в стиле проекта. Tailwind сбрасывает
// дефолтные стили тегов, поэтому каждому элементу задаём вид явно.
// react-markdown не вставляет сырой HTML из текста — безопасно по XSS.

// ── Жёлтый маркер `==текст==` ──
// Кнопка-маркер в тулбаре редактора пишет выделение именно так
// (синтаксис highlight-mark). react-markdown его не знает и оставляет
// текстом, поэтому режем текстовые узлы сами и оборачиваем в <mark>.
const HIGHLIGHT = /==([^=\n]+?)==/g;

function highlightChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string" || !child.includes("==")) return child;
    const parts: ReactNode[] = [];
    let last = 0;
    for (const match of child.matchAll(HIGHLIGHT)) {
      const index = match.index ?? 0;
      if (index > last) parts.push(child.slice(last, index));
      parts.push(
        <mark
          key={index}
          className="lesson-highlight rounded px-1 py-0.5 font-bold"
        >
          {match[1]}
        </mark>,
      );
      last = index + match[0].length;
    }
    if (parts.length === 0) return child;
    if (last < child.length) parts.push(child.slice(last));
    return <Fragment>{parts}</Fragment>;
  });
}

// ── Callout-панели: `> [!важно] текст` и `> [!инфо] текст` ──
// Жёлтая с лампочкой — «очень важно», зелёная — дополнительная информация.
// Обычная цитата без маркера остаётся зелёной рамкой слева.
//
// Визуальный редактор пишет их же в виде directive-синтаксиса
// (`:::info`/`:::note`/`:::tip` - зелёные, `:::caution`/`:::danger` -
// жёлтые, опционально `:::note[Заголовок]`). react-markdown directives
// не знает, поэтому перед рендером переписываем их в цитату с маркером.
const DIRECTIVE =
  /^:::(note|tip|info|caution|danger|warning)[^\S\n]*(?:\[(.*)\])?[^\S\n]*\n([\s\S]*?)^:::[^\S\n]*$/gm;
const DIRECTIVE_IMPORTANT = /^(caution|danger|warning)$/i;

function directivesToCallouts(markdown: string): string {
  return markdown.replace(
    DIRECTIVE,
    (_all, kind: string, title: string | undefined, body: string) => {
      const tag = DIRECTIVE_IMPORTANT.test(kind) ? "[!важно]" : "[!инфо]";
      const head = title?.trim() ? ` **${title.trim()}**` : "";
      return `${tag}${head}\n\n${body.trim()}`
        .split("\n")
        .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
        .join("\n");
    },
  );
}

const CALLOUT = /^\s*\[!(важно|инфо|important|info|осторожно|warning|совет|tip|note|доп)\]\s*/i;
const IMPORTANT = /^(важно|important|осторожно|warning)$/i;

type Callout = { items: ReactNode; important: boolean };

function calloutOf(children: ReactNode): Callout | null {
  const items = Children.toArray(children);
  const firstParagraph = items.find((node) => isValidElement(node));
  if (!isValidElement<{ children?: ReactNode }>(firstParagraph)) return null;
  const inner = Children.toArray(firstParagraph.props.children);
  const firstText = inner[0];
  if (typeof firstText !== "string") return null;
  const tag = CALLOUT.exec(firstText);
  if (!tag) return null;
  inner[0] = firstText.replace(CALLOUT, "");
  const index = items.indexOf(firstParagraph);
  items[index] = cloneElement(firstParagraph, { key: "callout-first" }, inner);
  return { items, important: IMPORTANT.test(tag[1] ?? "") };
}

const components: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: (props) => (
    <h1
      className="mt-6 text-2xl font-extrabold text-neutral-700 lg:text-3xl"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-5 text-xl font-bold text-neutral-700 lg:text-2xl"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-4 text-lg font-bold text-neutral-700 lg:text-xl"
      {...props}
    />
  ),
  p: ({ children, ...props }) => (
    <p className="text-base leading-relaxed text-neutral-600 lg:text-lg" {...props}>
      {highlightChildren(children)}
    </p>
  ),
  ul: (props) => (
    <ul
      className="list-disc space-y-1 pl-6 text-base text-neutral-600 lg:text-lg"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="list-decimal space-y-1 pl-6 text-base text-neutral-600 lg:text-lg"
      {...props}
    />
  ),
  li: ({ children, ...props }) => (
    <li {...props}>{highlightChildren(children)}</li>
  ),
  em: ({ children, ...props }) => (
    <em {...props}>{highlightChildren(children)}</em>
  ),
  a: (props) => (
    <a
      className="font-bold text-sky-500 underline hover:text-sky-600"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-bold text-neutral-700" {...props}>
      {highlightChildren(children)}
    </strong>
  ),
  blockquote: ({ children, ...props }) => {
    const callout = calloutOf(children);
    if (callout) {
      const important = callout.important;
      return (
        <aside
          className={
            (important
              ? "lesson-callout-important border-amber-300 bg-amber-50"
              : "lesson-callout-info border-green-300 bg-green-50") +
            " flex gap-x-3 rounded-2xl border-2 px-4 py-3 text-base text-neutral-700 lg:text-lg"
          }
          role="note"
        >
          <span aria-hidden className="shrink-0 text-2xl leading-none">
            {important ? "💡" : "ℹ️"}
          </span>
          <div className="flex min-w-0 flex-col gap-y-2 [&_p]:text-neutral-700">
            {callout.items}
          </div>
        </aside>
      );
    }
    return (
      <blockquote
        className="rounded-r-xl border-l-4 border-green-300 bg-green-50 px-4 py-3 text-base text-neutral-600 lg:text-lg"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  code: (props) => (
    <code
      className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm text-rose-600"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="lesson-markdown-code-block overflow-x-auto rounded-xl bg-neutral-800 p-4 font-mono text-sm text-neutral-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-neutral-100"
      {...props}
    />
  ),
  img: (props) => (
    // Файлы с нашего /media, размеры заранее неизвестны —
    // next/image не подходит.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="mx-auto max-w-full rounded-2xl border border-neutral-200"
      alt=""
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-t-2 border-neutral-200" />,
  // Таблицы из справочной теории: горизонтальный скролл на узких экранах,
  // шапка на цветной подложке, строки разделены линиями.
  table: (props) => (
    <div className="overflow-x-auto rounded-xl border-2 border-neutral-200">
      <table
        className="w-full border-collapse text-sm text-neutral-700 lg:text-base"
        {...props}
      />
    </div>
  ),
  thead: (props) => <thead className="bg-sky-50" {...props} />,
  th: (props) => (
    <th
      className="border-b-2 border-neutral-200 px-3 py-2 text-left font-bold"
      {...props}
    />
  ),
  td: ({ children, ...props }) => (
    <td
      className="border-b border-neutral-100 px-3 py-2 align-top"
      {...props}
    >
      {highlightChildren(children)}
    </td>
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-y-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {directivesToCallouts(children)}
      </ReactMarkdown>
    </div>
  );
}
