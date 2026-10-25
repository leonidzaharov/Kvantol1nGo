"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createPracticeId, createPracticeItem, createPracticeVariant } from "@/lib/practice-editor";
import type { StoredPracticeContent, StoredPracticeItem, StoredPracticeVariant } from "@/lib/practice-content";

const inputClass = "w-full min-w-0 rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";
const typeLabels = { choice: "Выбор ответа", text: "Короткий ответ", match: "Соедини пары" };

type Props = {
  content: StoredPracticeContent;
  onChange: (content: StoredPracticeContent) => void;
};

export function PracticeEditor({ content, onChange }: Props) {
  const updateSection = (bonus: boolean, items: StoredPracticeItem[]) =>
    onChange({ ...content, [bonus ? "bonusQuestions" : "questions"]: items });
  const updateItem = (bonus: boolean, id: string, change: (item: StoredPracticeItem) => StoredPracticeItem) => {
    const section = bonus ? content.bonusQuestions : content.questions;
    updateSection(bonus, section.map((item) => item.id === id ? change(item) : item));
  };
  const moveItem = (bonus: boolean, index: number, direction: -1 | 1) => {
    const items = [...(bonus ? content.bonusQuestions : content.questions)];
    const destination = index + direction;
    if (destination < 0 || destination >= items.length) return;
    [items[index], items[destination]] = [items[destination], items[index]];
    updateSection(bonus, items);
  };
  const changeBonus = (item: StoredPracticeItem, wasBonus: boolean) => {
    onChange({
      ...content,
      questions: wasBonus ? [...content.questions, item] : content.questions.filter((entry) => entry.id !== item.id),
      bonusQuestions: wasBonus ? content.bonusQuestions.filter((entry) => entry.id !== item.id) : [...content.bonusQuestions, item],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-neutral-500">В каждом пункте подготовь 2-3 разных примера одного навыка. После ошибки ученик увидит разбор, затем вернётся к другому примеру.</p>
      {([false, true] as const).map((bonus) => {
        const section = bonus ? content.bonusQuestions : content.questions;
        const limit = bonus ? 20 : 50;
        return (
          <section key={String(bonus)} className="flex flex-col gap-4" aria-label={bonus ? "Дополнительная практика" : "Основная практика"}>
            <h2 className="text-lg font-bold text-neutral-700">{bonus ? "Со звёздочкой" : "Основные пункты"} ({section.length})</h2>
            {section.map((item, index) => (
              <div key={item.id} className={"flex flex-col gap-4 rounded-2xl border-2 p-4 " + (bonus ? "border-amber-200 bg-amber-50/40" : "border-neutral-200")}>
                <div className="flex items-center gap-1">
                  <h3 className="flex-1 font-bold text-neutral-700">{bonus ? "Дополнительный" : "Основной"} пункт {index + 1}</h3>
                  <Button type="button" variant="ghost" size="sm" aria-label="Выше" disabled={index === 0} onClick={() => moveItem(bonus, index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="sm" aria-label="Ниже" disabled={index === section.length - 1} onClick={() => moveItem(bonus, index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="dangerOutline" size="sm" aria-label="Удалить пункт" onClick={() => updateSection(bonus, section.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <input type="checkbox" checked={bonus} disabled={bonus ? content.questions.length >= 50 : content.bonusQuestions.length >= 20} onChange={() => changeBonus(item, bonus)} className="h-5 w-5 accent-amber-500" />
                  Пункт со звёздочкой
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Короткое объяснение перед пунктом (необязательно)
                  <textarea rows={2} maxLength={800} value={item.intro ?? ""} onChange={(event) => updateItem(bonus, item.id, (old) => ({ ...old, intro: event.target.value }))} className={inputClass} />
                </label>
                {item.variants.map((variant, variantIndex) => (
                  <VariantEditor key={variant.id} variant={variant} index={variantIndex} canRemove={item.variants.length > 2}
                    onChange={(changed) => updateItem(bonus, item.id, (old) => ({ ...old, variants: old.variants.map((entry) => entry.id === variant.id ? changed : entry) }))}
                    onRemove={() => updateItem(bonus, item.id, (old) => ({ ...old, variants: old.variants.filter((entry) => entry.id !== variant.id) }))} />
                ))}
                <Button type="button" variant="ghost" size="sm" className="self-start" disabled={item.variants.length >= 3} onClick={() => {
                  const variant = createPracticeVariant(item.variants[0].type);
                  updateItem(bonus, item.id, (old) => ({ ...old, variants: [...old.variants, variant] }));
                }}><Plus className="mr-1 h-4 w-4" />Ещё пример</Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {(["choice", "text", "match"] as const).map((type) => (
                <Button key={type} type="button" variant={bonus ? "ghost" : "secondaryOutline"} disabled={section.length >= limit} onClick={() => updateSection(bonus, [...section, createPracticeItem(type)])}><Plus className="mr-1 h-4 w-4" />{bonus ? "⭐ " : ""}{typeLabels[type]}</Button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function VariantEditor({ variant, index, canRemove, onChange, onRemove }: {
  variant: StoredPracticeVariant;
  index: number;
  canRemove: boolean;
  onChange: (variant: StoredPracticeVariant) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-bold text-neutral-600">Пример {index + 1}</h4>
        <select aria-label={`Тип примера ${index + 1}`} value={variant.type} className={inputClass + " sm:max-w-56"} onChange={(event) => {
          const next = createPracticeVariant(event.target.value as StoredPracticeVariant["type"]);
          onChange({ ...next, id: variant.id, prompt: variant.prompt, explanation: variant.explanation });
        }}>
          {(["choice", "text", "match"] as const).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
        </select>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" disabled={!canRemove} aria-label={`Удалить пример ${index + 1}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Вопрос
        <textarea required rows={2} maxLength={3000} value={variant.prompt} className={inputClass} onChange={(event) => onChange({ ...variant, prompt: event.target.value })} />
      </label>
      {variant.type === "choice" && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-neutral-700">Варианты ответа (отметь правильный)</span>
          {variant.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-2">
              <input type="radio" name={`practice-correct-${variant.id}`} aria-label={`Правильный вариант ${optionIndex + 1}`} className="h-5 w-5 shrink-0 accent-green-500" checked={variant.correctIndex === optionIndex} onChange={() => onChange({ ...variant, correctIndex: optionIndex })} />
              <input required maxLength={300} aria-label={`Вариант ответа ${optionIndex + 1}`} value={option} className={inputClass} onChange={(event) => onChange({ ...variant, options: variant.options.map((entry, i) => i === optionIndex ? event.target.value : entry) })} />
              <Button type="button" variant="ghost" size="sm" disabled={variant.options.length <= 2} aria-label={`Удалить вариант ответа ${optionIndex + 1}`} onClick={() => onChange({ ...variant, options: variant.options.filter((_, i) => i !== optionIndex), correctIndex: variant.correctIndex === optionIndex ? 0 : variant.correctIndex > optionIndex ? variant.correctIndex - 1 : variant.correctIndex })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="self-start" disabled={variant.options.length >= 8} onClick={() => onChange({ ...variant, options: [...variant.options, ""] })}><Plus className="mr-1 h-4 w-4" />Вариант ответа</Button>
        </div>
      )}
      {variant.type === "text" && (
        <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Правильный короткий ответ
          <input required maxLength={1000} value={variant.correctAnswer} className={inputClass} onChange={(event) => onChange({ ...variant, correctAnswer: event.target.value })} />
        </label>
      )}
      {variant.type === "match" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-500">Каждая строка - правильная пара. У ученика карточки справа перемешаются.</p>
          {variant.left.map((left, pairIndex) => {
            const pair = variant.correctPairs.find((entry) => entry.leftId === left.id);
            const right = variant.right.find((entry) => entry.id === pair?.rightId);
            if (!right) return null;
            return (
              <div key={left.id} className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <input required maxLength={160} aria-label={`Пара ${pairIndex + 1}, слева`} value={left.label} className={inputClass} onChange={(event) => onChange({ ...variant, left: variant.left.map((entry) => entry.id === left.id ? { ...entry, label: event.target.value } : entry) })} />
                  <input required maxLength={160} aria-label={`Пара ${pairIndex + 1}, справа`} value={right.label} className={inputClass} onChange={(event) => onChange({ ...variant, right: variant.right.map((entry) => entry.id === right.id ? { ...entry, label: event.target.value } : entry) })} />
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={variant.left.length <= 2} aria-label={`Удалить пару ${pairIndex + 1}`} onClick={() => onChange({ ...variant, left: variant.left.filter((entry) => entry.id !== left.id), right: variant.right.filter((entry) => entry.id !== right.id), correctPairs: variant.correctPairs.filter((entry) => entry.leftId !== left.id) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            );
          })}
          <Button type="button" variant="ghost" size="sm" className="self-start" disabled={variant.left.length >= 8} onClick={() => {
            const left = { id: createPracticeId(), label: "" };
            const right = { id: createPracticeId(), label: "" };
            onChange({ ...variant, left: [...variant.left, left], right: [...variant.right, right], correctPairs: [...variant.correctPairs, { leftId: left.id, rightId: right.id }] });
          }}><Plus className="mr-1 h-4 w-4" />Пара</Button>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-bold text-neutral-700">Почему ответ правильный
        <textarea required rows={2} maxLength={1000} value={variant.explanation} className={inputClass} onChange={(event) => onChange({ ...variant, explanation: event.target.value })} />
      </label>
    </div>
  );
}
