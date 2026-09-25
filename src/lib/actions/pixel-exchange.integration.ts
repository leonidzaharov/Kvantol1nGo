import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INTEGRATION_ADMIN_ID, INTEGRATION_STUDENT_ID } from "@/test/integration-global-setup";
const identity = vi.hoisted(() => ({ id: "00000000-0000-4000-8000-000000000001" }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: identity.id } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db";
import { recordPixelExchange } from "./pixel-exchange";
import { chooseStudentAvatar } from "./student-avatar";
function form(pixels: number, requestId = randomUUID()) {
  const data = new FormData();
  for(const [key,value] of Object.entries({userId: INTEGRATION_STUDENT_ID, requestId, pixels: String(pixels), confirmed: "on"})) data.set(key,value);
  return data;
}
describe("аватары и защищённая ручная выдача", () => {
  beforeEach(async () => {
    identity.id = INTEGRATION_ADMIN_ID;
    await prisma.pixelRedemption.deleteMany({ where: { userId: INTEGRATION_STUDENT_ID } });
    await prisma.user.update({ where: { id: INTEGRATION_STUDENT_ID }, data: { currency: 1200, pixelsRedeemed: 0 } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  it("повторная отправка одной формы списывает монеты только один раз", async () => {
    const data = form(2);
    const result = await Promise.all([recordPixelExchange(null, data), recordPixelExchange(null, data)]);
    expect(result.every((row) => row?.success)).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } });
    expect(user.currency).toBe(1160); expect(user.pixelsRedeemed).toBe(2);
    expect(await prisma.pixelRedemption.count({ where: { userId: user.id } })).toBe(1);
  });
  it("две конкурирующие выдачи не превышают лимит курса", async () => {
    await prisma.user.update({ where: { id: INTEGRATION_STUDENT_ID }, data: { pixelsRedeemed: 59 } });
    const result = await Promise.all([recordPixelExchange(null, form(1)), recordPixelExchange(null, form(1))]);
    expect(result.filter((row) => row?.success)).toHaveLength(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } })).pixelsRedeemed).toBe(60);
  });
  it("не обменивает монеты без средств и запрещает ученику выдачу", async () => {
    await prisma.user.update({ where: { id: INTEGRATION_STUDENT_ID }, data: { currency: 19 } });
    expect((await recordPixelExchange(null, form(1)))?.error).toBeTruthy();
    identity.id = INTEGRATION_STUDENT_ID;
    await expect(recordPixelExchange(null, form(1))).rejects.toThrow("FORBIDDEN");
  });
  it("ученик сохраняет только свой аватар из пяти разрешённых", async () => {
    identity.id = INTEGRATION_STUDENT_ID;
    const data = new FormData(); data.set("avatarId", "robot"); data.set("userId", INTEGRATION_ADMIN_ID);
    expect((await chooseStudentAvatar(null,data)).success).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({where:{id:INTEGRATION_STUDENT_ID}})).avatarId).toBe("robot");
    data.set("avatarId", "../../other.png"); expect((await chooseStudentAvatar(null,data)).error).toBeTruthy();
  });
});
