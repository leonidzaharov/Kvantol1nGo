// Защита от «случайно накатили на не ту базу».
//
// DATABASE_URL (приложение) и DIRECT_URL (миграции) обязаны вести в одну
// базу. Хосты при этом могут отличаться (пулер соединений vs прямое
// соединение) — сравниваем имя базы в path.
//
// Staging-конфигурация (KVANTO_DEPLOYMENT_ENV=staging) должна явно
// подтвердить, что сидируется изолированная тестовая база.

function databaseName(value) {
  if (!value) return null;
  try {
    return new URL(value).pathname || null;
  } catch {
    return null;
  }
}

export function deploymentIsolationErrors(env) {
  const errors = [];

  const dbName = databaseName(env.DATABASE_URL);
  const directName = databaseName(env.DIRECT_URL);
  if (dbName && directName && dbName !== directName) {
    errors.push("DATABASE_URL и DIRECT_URL указывают на разные базы");
  }

  if (
    env.KVANTO_DEPLOYMENT_ENV === "staging" &&
    env.STAGING_DATABASE_CONFIRM !== "isolated-test-data"
  ) {
    errors.push(
      "Staging требует STAGING_DATABASE_CONFIRM=isolated-test-data до запуска миграций/сидов",
    );
  }

  return errors;
}
