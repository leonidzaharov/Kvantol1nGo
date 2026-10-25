import { describe, expect, it } from "vitest";

import { practiceItemsValid } from "./practice-config";
import { advancePractice, beginPracticeCheck, createPracticeFlow, failPracticeCheck, receivePracticeCheck } from "./practice-flow";
import type { PracticeCheckResult, PracticeItem } from "./practice-types";

const items: PracticeItem[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  variants: [0, 1].map((i) => ({ id: `${id}${i}`, type: "text", prompt: `Вопрос ${id}${i}` })),
}));
const response = (correct: boolean): PracticeCheckResult => ({ kind: "checked", correct, feedback: { answer: "Ответ", explanation: "Объяснение" } });
const feedback = (correct: boolean, total = 4) => receivePracticeCheck(beginPracticeCheck(createPracticeFlow(items.slice(0, total)), 1), 1, response(correct));

describe("practice flow", () => {
  it("requires a check and a feedback screen before advancing", () => {
    const initial = createPracticeFlow(items);
    expect(advancePractice(initial, 2)).toBe(initial);
    const checking = beginPracticeCheck(initial, 1);
    expect(advancePractice(checking, 2)).toBe(checking);
    const checked = receivePracticeCheck(checking, 1, response(true));
    expect(checked.phase).toBe("feedback");
    expect(checked.solvedIds).toEqual([]);
    expect(advancePractice(checked, 2).solvedIds).toEqual(["a"]);
  });

  it("moves an incorrect item after two other questions using another variant", () => {
    const next = advancePractice(feedback(false), 2);
    expect(next.queue.map(({ itemId }) => itemId)).toEqual(["b", "c", "a", "d"]);
    expect(next.queue[2]).toEqual({ itemId: "a", variantIndex: 1, attempts: 1 });
    expect(next.solvedIds).toEqual([]);
  });

  it("keeps the last incorrect item pending instead of finishing", () => {
    const next = advancePractice(feedback(false, 1), 2);
    expect(next.phase).toBe("answer");
    expect(next.queue).toEqual([{ itemId: "a", variantIndex: 1, attempts: 1 }]);
  });

  it("rotates variants without accumulating duplicate queue entries", () => {
    let flow = createPracticeFlow(items.slice(0, 1));
    for (let i = 1; i <= 6; i += 1) {
      flow = advancePractice(receivePracticeCheck(beginPracticeCheck(flow, i), i, response(false)), 2);
      expect(flow.queue).toHaveLength(1);
      expect(flow.queue[0].variantIndex).toBe(i % 2);
    }
    expect(flow.solvedIds).toEqual([]);
  });

  it("finishes only after a successful check and reading feedback", () => {
    const last = feedback(true, 1);
    expect(last.phase).toBe("feedback");
    expect(advancePractice(last, 2).phase).toBe("finished");
  });

  it("rejects repeated checks and stale async responses", () => {
    const checking = beginPracticeCheck(createPracticeFlow(items), 3);
    expect(beginPracticeCheck(checking, 4)).toBe(checking);
    expect(receivePracticeCheck(checking, 2, response(true))).toBe(checking);
    expect(failPracticeCheck(checking, 2)).toBe(checking);
  });

  it("recovers from network failure without changing progress", () => {
    const flow = failPracticeCheck(beginPracticeCheck(createPracticeFlow(items), 1), 1);
    expect(flow.phase).toBe("answer");
    expect(flow.solvedIds).toEqual([]);
    expect(flow.queue[0].attempts).toBe(0);
  });

  it.each(["invalid", "content-changed"] as const)("does not count %s as an educational mistake", (kind) => {
    const flow = receivePracticeCheck(beginPracticeCheck(createPracticeFlow(items), 1), 1, { kind });
    expect(flow.phase).toBe("answer");
    expect(flow.queue[0].attempts).toBe(0);
    expect(flow.result).toBeNull();
  });

  it("restores holes from exact IDs, ignoring duplicate and foreign saved IDs", () => {
    const flow = createPracticeFlow(items, ["c", "c", "foreign"]);
    expect(flow.queue.map(({ itemId }) => itemId)).toEqual(["a", "b", "d"]);
    expect(flow.solvedIds).toEqual(["c"]);
  });

  it("does not report empty content as finished", () => {
    expect(createPracticeFlow([]).phase).toBe("answer");
    expect(beginPracticeCheck(createPracticeFlow([]), 1).phase).toBe("answer");
  });
});

describe("practice component configuration", () => {
  it("requires unique item IDs and at least two variants", () => {
    expect(practiceItemsValid(items)).toBe(true);
    expect(practiceItemsValid([])).toBe(false);
    expect(practiceItemsValid([items[0], items[0]])).toBe(false);
    expect(practiceItemsValid([{ ...items[0], variants: items[0].variants.slice(0, 1) }])).toBe(false);
  });

  it("does not allow ambiguous matching cards or incomplete columns", () => {
    const variant = { id: "m", type: "match" as const, prompt: "Соедини", left: [{ id: "l1", label: "А" }, { id: "l2", label: "Б" }], right: [{ id: "r1", label: "В" }, { id: "r2", label: "Г" }] };
    const config = [{ id: "item", variants: [variant, { ...variant, id: "m2" }] }];
    expect(practiceItemsValid(config)).toBe(true);
    expect(practiceItemsValid([{ ...config[0], variants: [{ ...variant, right: variant.right.slice(0, 1) }, { ...variant, id: "m2" }] }])).toBe(false);
    expect(practiceItemsValid([{ ...config[0], variants: [{ ...variant, left: [variant.left[0], variant.left[0]] }, { ...variant, id: "m2" }] }])).toBe(false);
  });
});
