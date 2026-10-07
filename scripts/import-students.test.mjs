import { describe, expect, it } from "vitest";

import { validateImport } from "./import-students.mjs";

const hash = `$2b$10$${"a".repeat(53)}`;
const valid = {
  groups: [
    { name: "IT-01", track: "intro" },
    { name: "IT-Углублённый", track: "advanced" },
  ],
  students: [
    { group: "IT-01", nickname: "Максим См", mentorLabel: "Максим См.", pinHash: hash },
    { group: "IT-01", nickname: "Максим Су", mentorLabel: "Максим Су.", pinHash: hash },
    { group: "IT-Углублённый", nickname: "Максим См", mentorLabel: "Максим См.", pinHash: hash },
  ],
};

describe("validateImport", () => {
  it("принимает корректный состав, один ник допустим в разных группах", () => {
    const result = validateImport(valid);
    expect(result.errors).toEqual([]);
    expect(result.students).toHaveLength(3);
  });

  it("ловит повтор ника в группе без учёта регистра", () => {
    const { errors } = validateImport({
      ...valid,
      students: [valid.students[0], { ...valid.students[1], nickname: "максим  см" }],
    });
    expect(errors).toEqual(["students[1]: ник «максим см» уже есть в группе IT-01"]);
  });

  it("ловит точку в нике, неописанную группу, плохой хеш и направление", () => {
    const { errors } = validateImport({
      groups: [{ name: "IT-01", track: "beginner" }],
      students: [{ group: "IT-09", nickname: "Максим С.", mentorLabel: "Максим С.", pinHash: "1234" }],
    });
    expect(errors).toEqual([
      "groups[0]: неизвестное направление «beginner»",
      "students[0]: группа «IT-09» не описана в groups",
      "students[0]: недопустимый ник «Максим С.»",
      "students[0]: pinHash не похож на bcrypt",
    ]);
  });

  it("не пропускает пустой файл", () => {
    expect(validateImport({}).errors).toEqual(["нет ни одной группы", "нет ни одного ученика"]);
  });
});
