const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 500;
const MIN_SLOW_QUERY_THRESHOLD_MS = 50;
const MAX_SLOW_QUERY_THRESHOLD_MS = 60_000;

export type DatabaseQueryEvent = {
  query: string;
  duration: number;
  target: string;
};

export function getSlowQueryThresholdMs(
  rawValue = process.env.DB_SLOW_QUERY_MS,
): number {
  if (!rawValue?.trim()) return DEFAULT_SLOW_QUERY_THRESHOLD_MS;

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_SLOW_QUERY_THRESHOLD_MS;

  return Math.min(
    MAX_SLOW_QUERY_THRESHOLD_MS,
    Math.max(MIN_SLOW_QUERY_THRESHOLD_MS, Math.round(parsed)),
  );
}

function getQueryOperation(query: string): string {
  return query.trimStart().match(/^([a-z]+)/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
}

function getQueryRelations(query: string): string[] {
  // Prisma передаёт значения отдельно в event.params. Из SQL берём только
  // имена таблиц после служебных слов и никогда не журналируем параметры.
  const relationPattern =
    /\b(?:DELETE\s+FROM|FROM|JOIN|UPDATE|INTO)\s+(?:"[^"]+"\.)?"([^"]+)"/gi;
  const relations = new Set<string>();

  for (const match of query.matchAll(relationPattern)) {
    const relation = match[1];
    if (relation) relations.add(relation);
  }

  return [...relations].slice(0, 8);
}

export function formatSlowQueryWarning(
  event: DatabaseQueryEvent,
  thresholdMs = getSlowQueryThresholdMs(),
): string | null {
  if (event.duration < thresholdMs) return null;

  return `[db:slow] ${JSON.stringify({
    durationMs: Math.round(event.duration),
    thresholdMs,
    operation: getQueryOperation(event.query),
    relations: getQueryRelations(event.query),
    target: event.target,
  })}`;
}
