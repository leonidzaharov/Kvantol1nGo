# 🎨 Визуал: персонажи, скины, анимации — источники и план

> Заметка на будущее. Здесь собрано, где брать готовые персонажи/аватары/анимации
> для «Кванториума» **без рисования от руки**. Обновлено: 2026-06-23.

---

## Два разных вопроса (важно не путать)

1. **Скины-аватары пользователей** — у каждого ученика свой «персонаж»/картинка
   в профиле, лидерборде, на экране входа.
2. **Маскот с анимациями** — один герой, который реагирует: радуется на верный
   ответ, грустит на потерю жизни и т.п.

Источники и сложность у них **разные** — см. ниже.

---

## Как это делает сам Duolingo
Персонажей рисуют **не в коде**, а в **Rive** — редактор векторных интерактивных
анимаций со «state machine» (автомат состояний: idle / радость / грусть). Аниматор
собирает состояния, экспортирует один компактный файл, разработчик дёргает состояния
из приложения. Главный вывод практиков: **для персонажа с реакциями берут Rive, а не
Lottie** (Lottie — это таймлайн, а Rive — уже автомат состояний).

---

## Откуда брать готовое (бесплатно)

| Источник | Что это | Лицензия | Чем подключать (наш стек) |
|---|---|---|---|
| **LottieFiles** | библиотека готовых анимаций-персонажей (JSON/dotLottie) | Lottie Simple License — коммерческое можно; **проверять на каждом файле** | `lottie-react` или `@lottiefiles/dotlottie-react` |
| **Rive community** | готовые интерактивные маскоты (как у Duolingo) | бесплатно, лицензию смотреть пофайлово; часть фич редактора платные | `@rive-app/react-canvas` |
| **DiceBear** | генератор **аватаров-скинов** (35+ стилей), детерминированно по id/имени | либа MIT; стили по-разному (**Open Peeps = CC0**) | `@dicebear/core` + стиль, или URL-API |
| **Open Peeps / Open Doodles** | модульные «человечки» (миксуешь части) | **CC0** (без атрибуции, коммерция ок) | статичные SVG |
| **Humaaans** | модульные люди | free, но **не CC0** | статичные SVG |

⚠️ **Лицензии:** на LottieFiles и в Rive-community лицензия **у каждого файла своя** —
смотреть конкретный ассет перед использованием. Самый беспроблемный вариант — **CC0**
(Open Peeps, Open Doodles): без атрибуции, для коммерции тоже.

---

## Рекомендация для нашего проекта

- **Скины-аватары (вариант 1)** → **DiceBear** + стиль **Open Peeps**. Почти бесплатный
  выигрыш: у нас уже есть кружки с инициалами в профиле / лидерборде / на входе —
  меняем их на сгенерированный аватар (детерминированный по `user.id`, у каждого свой,
  без единой нарисованной картинки). ~20–30 минут работы.
- **Маскот (вариант 2)** → начать с **Lottie** (проще), при желании Duolingo-уровня —
  перейти на **Rive**. ⚠️ Учесть: мы сознательно **убирали маскота** ради «чистого
  Duolingo» — возврат героя это частичный откат того решения. Аватары этому НЕ противоречат.

---

## Что скачать / куда смотреть (на завтра)

- **Аватары:** https://www.dicebear.com/styles/open-peeps/ (или вся либа: https://www.dicebear.com/)
- **Анимации:** https://lottiefiles.com/free-animations/react — фильтровать по «character/mascot»,
  скачивать **dotLottie/JSON**, проверять лицензию у файла
- **Интерактивный маскот:** https://rive.app/community (искать «mascot», смотреть лицензию)
- **CC0-иллюстрации:** https://allsvgicons.com/cc0-illustrations/ , Open Peeps / Open Doodles

Когда скачаешь — клади файлы в `public/` (например `public/avatars/`, `public/lottie/`),
и скажи мне; подключу в код.

---

## Статьи-источники (практики)
- How Duolingo Animates Its World Characters — https://blog.duolingo.com/world-character-visemes/
- Creative technologists (Rive) — https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff
- How Duolingo Uses Rive (DEV) — https://dev.to/uianimation/how-duolingo-uses-rive-for-their-character-animation-and-how-you-can-build-a-similar-rive-mascot-5d19
- Stop Using Lottie for Characters (DEV) — https://dev.to/uianimation/stop-using-lottie-for-characters-why-rive-is-the-future-of-app-animation-1hjf
- LottieFiles free animations — https://lottiefiles.com/free-animations/react · License — https://lottiefiles.com/page/license
- lottie-react (npm) — https://www.npmjs.com/package/lottie-react
- DiceBear — https://www.dicebear.com/ · Open Peeps — https://www.dicebear.com/styles/open-peeps/
- CC0 illustration packs — https://allsvgicons.com/cc0-illustrations/
