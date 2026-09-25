import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Кванториум",
  description: "Какие данные учеников собирает платформа и зачем.",
};

// Рендерим на каждый запрос: строгий CSP (см. src/proxy.ts) подписывает
// скрипты одноразовым nonce, а в статическую страницу его не вставить.
export const dynamic = "force-dynamic";

// Короткая политика для учеников и родителей без технических терминов.
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-neutral-700 lg:text-3xl">
        Политика конфиденциальности
      </h1>

      <div className="mt-6 flex flex-col gap-y-5 font-medium text-neutral-600">
        <section>
          <h2 className="font-bold text-neutral-700">Какие данные мы храним</h2>
          <p>
            Для работы платформы используются выбранный учеником ник,
            короткая внутренняя пометка без имени и фамилии, данные об учебном
            прогрессе, достижениях и последнем входе. Настоящие имя и фамилия,
            адрес, номер телефона и электронная почта ученика не требуются.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-neutral-700">Зачем</h2>
          <p>
            Только чтобы платформа работала как помощник на занятиях: показывала
            прогресс, начисляла награды и помогала наставнику видеть, кто давно
            не занимался. Ничего лишнего мы не собираем.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-neutral-700">Где хранятся данные</h2>
          <p>
            Все данные сохраняются на защищённом сервере образовательной
            организации. Доступ к ним ограничен наставником и администратором
            сервера. Данные не продаются, не используются для рекламы и не
            передаются третьим лицам.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-neutral-700">Дети</h2>
          <p>
            Платформа используется для организации обучения детей под
            руководством наставника. Данные используются только для проведения
            занятий и учёта учебного прогресса в соответствии с применимыми
            требованиями законодательства Российской Федерации.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-neutral-700">Ваши права</h2>
          <p>
            Родитель или законный представитель может попросить показать,
            исправить или удалить данные ученика. Свяжитесь с нами по телефону{" "}
            <a className="font-bold text-green-600" href="tel:+79650444018">
              +7 (965) 044-40-18
            </a>{" "}
            или электронной почте{" "}
            <a
              className="font-bold text-green-600"
              href="mailto:kvantorium47@mail.ru"
            >
              kvantorium47@mail.ru
            </a>
            . По обращению профиль и связанный с ним прогресс будут удалены.
          </p>
        </section>
      </div>

      <div className="mt-8">
        <Button variant="secondary" size="lg" asChild>
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
