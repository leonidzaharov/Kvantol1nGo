import { describe, expect, it } from "vitest";
import { pixelExchangeSummary } from "./pixel-economy";
describe("обмен монет на внешние пиксели", () => {
  it("не выдаёт дробные пиксели", () => { expect(pixelExchangeSummary(19, 0).available).toBe(0); expect(pixelExchangeSummary(39, 0).available).toBe(1); });
  it("учитывает прошлые выплаты и ограничивает курс 60 пикселями", () => { expect(pixelExchangeSummary(5000, 58).available).toBe(2); expect(pixelExchangeSummary(5000, 60).available).toBe(0); });
  it("оставляет недостающие монеты на следующую выдачу", () => { expect(pixelExchangeSummary(10, 4).available).toBe(0); expect(pixelExchangeSummary(30, 4).available).toBe(1); });
});
