export type TheorySection = {
  title: string;
  markdown: string;
};

type MarkdownHeading = {
  index: number;
  level: number;
  title: string;
};

function cleanHeadingTitle(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

/**
 * Возвращает заголовки вне fenced code blocks. Иначе строка `# комментарий`
 * внутри примера Python ошибочно стала бы новым шагом теории.
 */
function findHeadings(lines: string[]): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let fence: "```" | "~~~" | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trimStart();
    if (fence !== null) {
      if (trimmed.startsWith(fence)) fence = null;
      return;
    }
    if (trimmed.startsWith("```")) {
      fence = "```";
      return;
    }
    if (trimmed.startsWith("~~~")) {
      fence = "~~~";
      return;
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed);
    if (!match) return;
    headings.push({
      index,
      level: match[1]!.length,
      title: cleanHeadingTitle(match[2]!),
    });
  });

  return headings;
}

/**
 * Делит Markdown на детские «экраны» без нового формата базы:
 * - два и более H1 → шаги по H1;
 * - иначе два и более H2 → шаги по H2;
 * - короткая теория остаётся одним экраном.
 *
 * Текст перед первым выбранным заголовком присоединяется к первому шагу,
 * поэтому название урока и вступление не теряются.
 */
export function splitTheoryIntoSections(markdown: string): TheorySection[] {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (normalized === "") return [];

  const lines = normalized.split("\n");
  const headings = findHeadings(lines);
  const splitLevel = [1, 2].find(
    (level) => headings.filter((heading) => heading.level === level).length >= 2,
  );

  if (splitLevel === undefined) {
    return [
      {
        title: headings[0]?.title || "Теория",
        markdown: normalized,
      },
    ];
  }

  const splitHeadings = headings.filter(
    (heading) => heading.level === splitLevel,
  );
  const prefix = lines.slice(0, splitHeadings[0]!.index).join("\n").trim();

  return splitHeadings.map((heading, sectionIndex) => {
    const nextHeading = splitHeadings[sectionIndex + 1];
    const body = lines
      .slice(heading.index, nextHeading?.index ?? lines.length)
      .join("\n")
      .trim();
    return {
      title: heading.title || `Шаг ${sectionIndex + 1}`,
      markdown:
        sectionIndex === 0 && prefix !== "" ? `${prefix}\n\n${body}` : body,
    };
  });
}
