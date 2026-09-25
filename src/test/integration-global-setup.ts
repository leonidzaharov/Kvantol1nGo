import "dotenv/config";

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const INTEGRATION_SCHEMA = "integration";

export const INTEGRATION_ADMIN_ID = "00000000-0000-4000-8000-000000000001";
export const INTEGRATION_STUDENT_ID = "00000000-0000-4000-8000-000000000002";
export const INTEGRATION_GROUP = "integration-01";

function baseUrl(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Для интеграционных тестов нужен DIRECT_URL или DATABASE_URL.",
    );
  }
  return url;
}

function schemaUrl(): string {
  const url = new URL(baseUrl());
  url.searchParams.set("schema", INTEGRATION_SCHEMA);
  return url.toString();
}

async function dropSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${INTEGRATION_SCHEMA}" CASCADE`);
  } finally {
    await client.end();
  }
}

export default async function setup() {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS "${INTEGRATION_SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${INTEGRATION_SCHEMA}"`);
  } finally {
    await client.end();
  }

  const url = schemaUrl();
  const prismaCli = fileURLToPath(
    new URL("../../node_modules/prisma/build/index.js", import.meta.url),
  );
  const migration = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      stdio: "inherit",
      env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
    },
  );
  if (migration.status !== 0) {
    await dropSchema();
    throw new Error("prisma migrate deploy для integration-схемы завершился с ошибкой");
  }

  try {
    const fixtureClient = new pg.Client({ connectionString: baseUrl() });
    await fixtureClient.connect();
    try {
      await fixtureClient.query(`SET search_path TO "${INTEGRATION_SCHEMA}"`);
      const { rows: groups } = await fixtureClient.query<{ id: number }>(
        `INSERT INTO "Group" (name, track)
         VALUES ($1, 'intro')
         RETURNING id`,
        [INTEGRATION_GROUP],
      );
      const groupId = groups[0]?.id;
      if (!groupId) {
        throw new Error("Не удалось создать интеграционную группу");
      }

      // PIN в этих тестах не проверяется: сессию подменяем на уровне auth(),
      // а requireAdmin() всё равно читает актуальную роль из настоящей БД.
      await fixtureClient.query(
        `INSERT INTO "User" (id, name, "pinHash", "isAdmin")
         VALUES ($1, 'Integration Admin', 'not-used', true)`,
        [INTEGRATION_ADMIN_ID],
      );
      await fixtureClient.query(
        `INSERT INTO "User"
           (id, name, "mentorLabel", "profileConfiguredAt", "pinHash", "groupId", "isAdmin")
         VALUES ($1, 'Integration Student', 'Integration Student', NOW(), 'not-used', $2, false)`,
        [INTEGRATION_STUDENT_ID, groupId],
      );
    } finally {
      await fixtureClient.end();
    }
  } catch (error) {
    await dropSchema();
    throw error;
  }

  return async () => {
    await dropSchema();
  };
}
