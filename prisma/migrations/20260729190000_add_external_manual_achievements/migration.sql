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
    'TECHNOGTO_PARTICIPANT',
    'Участник ТехноГТО',
    'Ученик прошёл официальное испытание ТехноГТО.',
    '🏅',
    'manual_award',
    'epic',
    NULL,
    1,
    5,
    false,
    NULL,
    true,
    190
  ),
  (
    'TECHNOGTO_GOLD',
    'Золотая медаль ТехноГТО',
    'Получен золотой знак или золотая медаль ТехноГТО.',
    '🥇',
    'manual_award',
    'legendary',
    NULL,
    1,
    10,
    false,
    NULL,
    true,
    200
  ),
  (
    'NTO_PARTICIPANT',
    'Участник НТО',
    'Ученик выполнил задания официального этапа НТО.',
    '🧠',
    'manual_award',
    'epic',
    NULL,
    1,
    5,
    false,
    NULL,
    true,
    210
  ),
  (
    'NTO_COMPLETED',
    'НТО пройдено',
    'Ученик сдал отборочный этап НТО.',
    '🧩',
    'manual_award',
    'legendary',
    NULL,
    1,
    10,
    false,
    NULL,
    true,
    220
  ),
  (
    'NTO_FINALIST',
    'Финалист НТО',
    'Ученик вышел в финал НТО.',
    '🏆',
    'manual_award',
    'mythic',
    NULL,
    1,
    15,
    false,
    NULL,
    true,
    230
  ),
  (
    'CONTEST_FARMER',
    'Фармер конкурсов',
    'Подтверждено участие минимум в пяти конкурсах.',
    '🎟️',
    'manual_award',
    'rare',
    NULL,
    1,
    5,
    true,
    'Некоторые считают конкурсы. Другие просто продолжают участвовать.',
    true,
    240
  ),
  (
    'DIPLOMA_HUNTER',
    'Охотник за дипломами',
    'Подтверждено участие минимум в десяти конкурсах.',
    '📜',
    'manual_award',
    'epic',
    NULL,
    1,
    8,
    true,
    'Некоторые коллекции собираются не на полке.',
    true,
    250
  ),
  (
    'CONTEST_WINNER',
    'Победитель',
    'Получено призовое место в конкурсе.',
    '🥉',
    'manual_award',
    'legendary',
    NULL,
    1,
    10,
    false,
    NULL,
    true,
    260
  ),
  (
    'MENTOR_RESPECT',
    'Респект от наставника',
    'Наставник отмечает значительный прогресс, ответственность или вклад в группу.',
    '🙌',
    'manual_award',
    'epic',
    NULL,
    1,
    5,
    true,
    'Наставник замечает больше, чем кажется.',
    true,
    270
  ),
  (
    'KVANTORIUM_AMBASSADOR',
    'Лицо Кванториума',
    'Ученик достойно представил Кванториум на внешнем мероприятии.',
    '🌟',
    'manual_award',
    'legendary',
    NULL,
    1,
    10,
    true,
    'Иногда один участник представляет целую команду.',
    true,
    280
  );

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM "Achievement"
    WHERE "code" IN (
      'TECHNOGTO_PARTICIPANT',
      'TECHNOGTO_GOLD',
      'NTO_PARTICIPANT',
      'NTO_COMPLETED',
      'NTO_FINALIST',
      'CONTEST_FARMER',
      'DIPLOMA_HUNTER',
      'CONTEST_WINNER',
      'MENTOR_RESPECT',
      'KVANTORIUM_AMBASSADOR'
    )
      AND "metric" = 'manual_award'
      AND "isActive" = true
  ) <> 10 THEN
    RAISE EXCEPTION 'Ожидалось ровно 10 новых активных ручных достижений';
  END IF;
END
$$;
