export function localDatabaseConfig(env) {
  const urls = [env.DATABASE_URL, env.DIRECT_URL].map((value) => {
    if (!value) throw new Error("Для локального запуска нужны DATABASE_URL и DIRECT_URL.");
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        [...url.searchParams.keys()].some((key) => ['host', 'hostaddr', 'service'].includes(key))) {
      throw new Error("npm run dev разрешает только локальную PostgreSQL. Удалённая база не используется.");
    }
    return url;
  });
  const [database, direct] = urls;
  const identity = (url) => `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  if (identity(database) !== identity(direct)) {
    throw new Error("DATABASE_URL и DIRECT_URL должны указывать на одну локальную базу.");
  }
  return { connectionString: database.toString(), port: database.port || '5432' };
}
