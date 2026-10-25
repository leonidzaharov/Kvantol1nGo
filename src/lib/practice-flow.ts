import type { PracticeCheckResult, PracticeItem } from "./practice-types";

type QueueItem = { itemId: string; variantIndex: number; attempts: number };
type Checked = Extract<PracticeCheckResult, { kind: "checked" }>;

export type PracticeFlow = {
  queue: QueueItem[];
  solvedIds: string[];
  phase: "answer" | "checking" | "feedback" | "finished";
  requestId: number | null;
  result: Checked | null;
};

export function createPracticeFlow(
  items: readonly PracticeItem[],
  solvedIds: readonly string[] = [],
): PracticeFlow {
  const known = new Set(items.map((item) => item.id));
  const solved = [...new Set(solvedIds)].filter((id) => known.has(id));
  const queue = items
    .filter((item) => !solved.includes(item.id))
    .map((item) => ({ itemId: item.id, variantIndex: 0, attempts: 0 }));
  return {
    queue,
    solvedIds: solved,
    // Empty content must not look like a completed exercise.
    phase: items.length > 0 && queue.length === 0 ? "finished" : "answer",
    requestId: null,
    result: null,
  };
}

export function beginPracticeCheck(flow: PracticeFlow, requestId: number): PracticeFlow {
  if (flow.phase !== "answer" || flow.queue.length === 0) return flow;
  return { ...flow, phase: "checking", requestId };
}

export function receivePracticeCheck(
  flow: PracticeFlow,
  requestId: number,
  result: PracticeCheckResult,
): PracticeFlow {
  if (flow.phase !== "checking" || flow.requestId !== requestId) return flow;
  if (result.kind !== "checked") return failPracticeCheck(flow, requestId);
  return { ...flow, phase: "feedback", requestId: null, result };
}

export function failPracticeCheck(flow: PracticeFlow, requestId: number): PracticeFlow {
  if (flow.phase !== "checking" || flow.requestId !== requestId) return flow;
  return { ...flow, phase: "answer", requestId: null, result: null };
}

export function advancePractice(flow: PracticeFlow, variantCount: number): PracticeFlow {
  if (flow.phase !== "feedback" || !flow.result || !flow.queue.length) return flow;
  if (!Number.isInteger(variantCount) || variantCount < 2 || variantCount > 3) {
    throw new Error("Practice requires 2 or 3 variants per item");
  }
  const [current, ...queue] = flow.queue;
  let solvedIds = flow.solvedIds;
  if (flow.result.correct) {
    solvedIds = [...new Set([...solvedIds, current.itemId])];
  } else {
    queue.splice(Math.min(2, queue.length), 0, {
      itemId: current.itemId,
      variantIndex: (current.variantIndex + 1) % variantCount,
      attempts: current.attempts + 1,
    });
  }
  return {
    queue,
    solvedIds,
    phase: queue.length ? "answer" : "finished",
    requestId: null,
    result: null,
  };
}
