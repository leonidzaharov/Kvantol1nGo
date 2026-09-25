-- Полностью заменяем старый каталог достижений первой версией из листа
-- «02_Ачивки». Пользовательские витрины и прогресс старого каталога
-- намеренно очищаются: старые и новые достижения несовместимы по смыслу.
UPDATE "User"
SET "showcaseAchievementId" = NULL
WHERE "showcaseAchievementId" IS NOT NULL;

DELETE FROM "UserAchievement";
DELETE FROM "Achievement";

INSERT INTO "Achievement" (
  "code",
  "title",
  "description",
  "icon",
  "metric",
  "rarity",
  "categoryId",
  "targetValue",
  "rewardCurrency",
  "isHidden",
  "hiddenHint",
  "isActive",
  "sortOrder"
)
VALUES
  (
    'FIRST_RUN',
    'Первый запуск',
    'Завершен первый учебный урок.',
    '🚀',
    'lessons_completed',
    'common',
    NULL,
    1,
    0,
    false,
    NULL,
    true,
    10
  ),
  (
    'FIVE_STEPS',
    'Пять шагов',
    'Пройдено пять уроков.',
    '👣',
    'lessons_completed',
    'common',
    NULL,
    5,
    2,
    false,
    NULL,
    true,
    20
  ),
  (
    'TEN_LESSONS',
    'Вошел в ритм',
    'Пройдено десять уроков.',
    '🎯',
    'lessons_completed',
    'uncommon',
    NULL,
    10,
    3,
    false,
    NULL,
    true,
    30
  ),
  (
    'STABLE_ROUTE',
    'Стабильный маршрут',
    'Пройдено двадцать пять уроков.',
    '🧭',
    'lessons_completed',
    'uncommon',
    NULL,
    25,
    5,
    false,
    NULL,
    true,
    40
  ),
  (
    'HALFWAY',
    'Половина пути',
    'Пройдено пятьдесят уроков.',
    '🛤️',
    'lessons_completed',
    'rare',
    NULL,
    50,
    8,
    false,
    NULL,
    true,
    50
  ),
  (
    'ALMOST_RELEASE',
    'Финишная прямая',
    'Пройдено семьдесят пять уроков.',
    '🏁',
    'lessons_completed',
    'epic',
    NULL,
    75,
    10,
    false,
    NULL,
    true,
    60
  ),
  (
    'LEVEL_5',
    'Исследователь',
    'Достигнут пятый уровень.',
    '🔎',
    'level_reached',
    'common',
    NULL,
    5,
    1,
    false,
    NULL,
    true,
    70
  ),
  (
    'LEVEL_10',
    'Разработчик',
    'Достигнут десятый уровень.',
    '💻',
    'level_reached',
    'uncommon',
    NULL,
    10,
    2,
    false,
    NULL,
    true,
    80
  ),
  (
    'LEVEL_15',
    'Инженер цифрового мира',
    'Достигнут пятнадцатый уровень.',
    '⚙️',
    'level_reached',
    'rare',
    NULL,
    15,
    4,
    false,
    NULL,
    true,
    90
  ),
  (
    'PYTHON_ROUTE',
    'Укротитель Python',
    'Полностью завершен курс Python.',
    '🐍',
    'category_completed',
    'rare',
    (SELECT "id" FROM "Category" WHERE lower("name") = lower('Python') ORDER BY "id" LIMIT 1),
    1,
    8,
    false,
    NULL,
    true,
    100
  ),
  (
    'GODOT_ROUTE',
    'Повелитель сцен',
    'Полностью завершен курс Godot.',
    '🎮',
    'category_completed',
    'rare',
    (SELECT "id" FROM "Category" WHERE lower("name") = lower('Godot') ORDER BY "id" LIMIT 1),
    1,
    8,
    false,
    NULL,
    true,
    110
  ),
  (
    'PROJECT_ROUTE',
    'Проект доведен до конца',
    'Завершен проектный курс.',
    '🛠️',
    'category_completed',
    'epic',
    (
      SELECT "id"
      FROM "Category"
      WHERE lower("name") LIKE '%проект%'
      ORDER BY "id"
      LIMIT 1
    ),
    1,
    15,
    false,
    NULL,
    true,
    120
  ),
  (
    'CLEAN_START',
    'С первого запуска',
    'Один урок пройден без ошибки.',
    '✨',
    'perfect_lessons',
    'common',
    NULL,
    1,
    0,
    true,
    'Не всегда первая попытка бывает случайной.',
    true,
    130
  ),
  (
    'ATTENTIVE_5',
    'Внимательный разработчик',
    'Пять уроков пройдены без ошибки.',
    '👀',
    'perfect_lessons',
    'uncommon',
    NULL,
    5,
    2,
    true,
    'Точность складывается из маленьких проверок.',
    true,
    140
  ),
  (
    'PRECISION_15',
    'Точная сборка',
    'Пятнадцать уроков пройдены без ошибки.',
    '🎯',
    'perfect_lessons',
    'rare',
    NULL,
    15,
    4,
    true,
    'Иногда код работает именно так, как ожидалось.',
    true,
    150
  ),
  (
    'SECOND_PILOT',
    'Второй пилот',
    'Оказана содержательная помощь другому ученику без выполнения работы за него.',
    '🤝',
    'manual_award',
    'uncommon',
    NULL,
    1,
    5,
    true,
    'Иногда лучший разработчик сидит рядом.',
    true,
    160
  ),
  (
    'REFACTOR',
    'Работает — теперь лучше',
    'Работающий код улучшен, а изменение объяснено.',
    '♻️',
    'manual_award',
    'rare',
    NULL,
    1,
    5,
    true,
    'Не всякое улучшение добавляет новую функцию.',
    true,
    170
  ),
  (
    'EASTER_EGG',
    'Пасхальное яйцо',
    'Найдено специальное скрытое задание.',
    '🥚',
    'manual_award',
    'uncommon',
    NULL,
    1,
    1,
    true,
    'Внимательные иногда находят больше.',
    true,
    180
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM "Achievement" WHERE "isActive" = true) <> 18 THEN
    RAISE EXCEPTION 'Ожидалось ровно 18 активных достижений первой версии';
  END IF;
END
$$;
