import ReactMarkdown from "react-markdown";

// Отрисовка markdown-теории урока в стиле проекта. Tailwind сбрасывает
// дефолтные стили тегов, поэтому каждому элементу задаём вид явно.
// react-markdown не вставляет сырой HTML из текста — безопасно по XSS.
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
  p: (props) => (
    <p className="text-base leading-relaxed text-neutral-600 lg:text-lg" {...props} />
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
  a: (props) => (
    <a
      className="font-bold text-sky-500 underline hover:text-sky-600"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  strong: (props) => (
    <strong className="font-bold text-neutral-700" {...props} />
  ),
  blockquote: (props) => (
    <blockquote
      className="rounded-r-xl border-l-4 border-green-300 bg-green-50 px-4 py-3 text-base text-neutral-600 lg:text-lg"
      {...props}
    />
  ),
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
    // Ссылки внешние (Supabase Storage), размеры заранее неизвестны —
    // next/image не подходит.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="mx-auto max-w-full rounded-2xl border border-neutral-200"
      alt=""
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-t-2 border-neutral-200" />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-y-4">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
