-- Старый тестовый ученик «крутожаб» из перенесённой базы (id не UUID,
-- без группы). Убираем его вместе с данными. Таблицы без ON DELETE CASCADE
-- чистим явно (как src/lib/student-deletion.ts), остальное уходит каскадом.
-- В базах, где такой записи нет, запросы ничего не делают.
DELETE FROM "LoginAttempt" WHERE "userId" = 'user-123';
DELETE FROM "UserLessonProgress" WHERE "userId" = 'user-123';
DELETE FROM "UserAchievement" WHERE "userId" = 'user-123';
DELETE FROM "UserResource" WHERE "userId" = 'user-123';
DELETE FROM "User" WHERE "id" = 'user-123' AND NOT "isAdmin";
