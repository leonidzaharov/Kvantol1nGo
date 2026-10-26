import { describe, expect, it } from "vitest";

import {
  extractScratchId,
  extractYouTubeId,
  parseResourceInput,
} from "./resource-input";

describe("extractYouTubeId", () => {
  it("принимает голый 11-символьный ID как есть", () => {
    expect(extractYouTubeId("M7lc1UVf-VE")).toBe("M7lc1UVf-VE");
  });

  it("достаёт ID из youtube.com/watch?v=…", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=M7lc1UVf-VE&t=42s"),
    ).toBe("M7lc1UVf-VE");
  });

  it("достаёт ID из короткой ссылки youtu.be/…", () => {
    expect(extractYouTubeId("https://youtu.be/M7lc1UVf-VE?si=abc")).toBe(
      "M7lc1UVf-VE",
    );
  });

  it("достаёт ID из shorts и embed", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/shorts/M7lc1UVf-VE"),
    ).toBe("M7lc1UVf-VE");
    expect(
      extractYouTubeId("https://www.youtube.com/embed/M7lc1UVf-VE"),
    ).toBe("M7lc1UVf-VE");
  });

  it("отклоняет чужие сайты и мусор", () => {
    expect(extractYouTubeId("https://example.com/watch?v=M7lc1UVf-VE")).toBe(
      null,
    );
    expect(extractYouTubeId("просто текст")).toBe(null);
    expect(extractYouTubeId("")).toBe(null);
  });
});

describe("extractScratchId", () => {
  it("принимает голый числовой ID", () => {
    expect(extractScratchId("10128407")).toBe("10128407");
  });

  it("достаёт ID из ссылки на проект (и с хвостом, и без)", () => {
    expect(extractScratchId("https://scratch.mit.edu/projects/10128407")).toBe(
      "10128407",
    );
    expect(
      extractScratchId("https://scratch.mit.edu/projects/10128407/editor/"),
    ).toBe("10128407");
  });

  it("отклоняет чужие сайты и нечисловые ID", () => {
    expect(extractScratchId("https://example.com/projects/10128407")).toBe(
      null,
    );
    expect(extractScratchId("abc")).toBe(null);
  });
});

describe("parseResourceInput", () => {
  const base = {
    title: "Заголовок",
    description: "",
    url: "",
    body: "",
    coinReward: "3",
    sortOrder: "0",
  };

  it("stores a virtual practice as an internal article without a second reward", () => {
    expect(parseResourceInput({ ...base, type: "practice", url: "/lesson/00042/", coinReward: "999999" })).toEqual({
      ok: true, data: {
        type: "article", title: "Заголовок", description: null, url: "/lesson/42",
        body: null, coinReward: 0, sortOrder: 0,
      },
    });
  });

  it("does not allow a stored practice URL to bypass its reward rule using article type", () => {
    const result = parseResourceInput({ ...base, type: "article", url: "/lesson/42", coinReward: "20" });
    expect(result).toMatchObject({ ok: true, data: { type: "article", url: "/lesson/42", coinReward: 0 } });
  });

  it("rejects missing, external and malformed practice destinations", () => {
    for (const url of ["", "42", "/lesson/0", "/lesson/42/preview", "https://example.org/lesson/42"]) {
      expect(parseResourceInput({ ...base, type: "practice", url }).ok).toBe(false);
    }
  });

  it("видео: нормализует полную ссылку до ID", () => {
    const r = parseResourceInput({
      ...base,
      type: "video",
      url: "https://youtu.be/M7lc1UVf-VE",
    });
    expect(r).toEqual({
      ok: true,
      data: {
        type: "video",
        title: "Заголовок",
        description: null,
        url: "M7lc1UVf-VE",
        body: null,
        coinReward: 3,
        sortOrder: 0,
      },
    });
  });

  it("видео без внятной ссылки — ошибка по-русски", () => {
    const r = parseResourceInput({ ...base, type: "video", url: "мусор" });
    expect(r.ok).toBe(false);
  });

  it("ссылка (article): требует https://", () => {
    const bad = parseResourceInput({
      ...base,
      type: "article",
      url: "http://example.com",
    });
    expect(bad.ok).toBe(false);

    const good = parseResourceInput({
      ...base,
      type: "article",
      url: "https://scratch.mit.edu",
    });
    expect(good.ok).toBe(true);
  });

  it("совет (note): требует текст, ссылку игнорирует", () => {
    const bad = parseResourceInput({ ...base, type: "note", body: "" });
    expect(bad.ok).toBe(false);

    const good = parseResourceInput({
      ...base,
      type: "note",
      body: "Пробуй!",
      url: "https://example.com", // прилетело из формы — должно отброситься
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.data.url).toBe(null);
      expect(good.data.body).toBe("Пробуй!");
    }
  });

  it("пустой заголовок — ошибка", () => {
    const r = parseResourceInput({
      ...base,
      type: "note",
      title: "  ",
      body: "текст",
    });
    expect(r.ok).toBe(false);
  });

  it("монеты вне диапазона 0–100 или мусор — ошибка", () => {
    const negative = parseResourceInput({
      ...base,
      type: "note",
      body: "текст",
      coinReward: "-1",
    });
    expect(negative.ok).toBe(false);

    const junk = parseResourceInput({
      ...base,
      type: "note",
      body: "текст",
      coinReward: "abc",
    });
    expect(junk.ok).toBe(false);
  });
});
