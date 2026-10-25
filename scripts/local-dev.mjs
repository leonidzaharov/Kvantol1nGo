import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';
import pg from 'pg';
import { localDatabaseConfig } from './local-dev-config.mjs';

// Runs only before npm run dev. Production start/build do not use this file.
nextEnv.loadEnvConfig(process.cwd(), true);

try {
  const { connectionString, port } = localDatabaseConfig(process.env);
  if (process.env.LOCAL_POSTGRES_BIN) {
    if (!process.env.LOCAL_POSTGRES_DATA) throw new Error('Не задан LOCAL_POSTGRES_DATA.');
    const data = realpathSync(process.env.LOCAL_POSTGRES_DATA);
    const root = path.dirname(data);
    const ctl = path.resolve(process.env.LOCAL_POSTGRES_BIN, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
    if (!existsSync(ctl)) throw new Error('Не найдена локальная PostgreSQL. См. docs/LOCAL_DEVELOPMENT.md.');
    // A background Windows process must not inherit the terminal's pipe handles.
    const run = (args) => spawnSync(ctl, args, { windowsHide: true, stdio: 'ignore', timeout: 25000 });
    const status = run(['status', '-D', data]);
    if (status.status !== 0) {
      const started = run(['start', '-D', data, '-l', path.join(root, 'postgres.log'),
        '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '20']);
      if (started.status !== 0) throw new Error(`PostgreSQL не запустилась. Журнал: ${path.join(root, 'postgres.log')}`);
    }
  }
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
  console.log('Локальная PostgreSQL готова. Запускаем сайт.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Ошибка локальной базы.');
  process.exitCode = 1;
}
