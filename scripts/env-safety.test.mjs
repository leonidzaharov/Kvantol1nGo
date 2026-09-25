import { describe, expect, it } from "vitest";

import { deploymentIsolationErrors } from "./env-safety.mjs";

const PROJECT_REF = "abcdefghijklmnopqrst";
const validSupabaseEnv = {
  DATABASE_URL: `postgresql://postgres.${PROJECT_REF}:secret@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
  DIRECT_URL: `postgresql://postgres:secret@db.${PROJECT_REF}.supabase.co:5432/postgres`,
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
};

describe("deploymentIsolationErrors", () => {
  it("разрешает согласованное локальное окружение", () => {
    expect(deploymentIsolationErrors(validSupabaseEnv)).toEqual([]);
  });

  it("останавливает Preview без явного подтверждения staging", () => {
    expect(
      deploymentIsolationErrors({
        ...validSupabaseEnv,
        VERCEL_ENV: "preview",
      }),
    ).toEqual([
      "Vercel Preview требует KVANTO_DEPLOYMENT_ENV=staging до запуска миграций",
      "Vercel Preview требует STAGING_DATABASE_CONFIRM=isolated-test-data",
    ]);
  });

  it("разрешает Preview с изолированной staging-конфигурацией", () => {
    expect(
      deploymentIsolationErrors({
        ...validSupabaseEnv,
        VERCEL_ENV: "preview",
        KVANTO_DEPLOYMENT_ENV: "staging",
        STAGING_DATABASE_CONFIRM: "isolated-test-data",
      }),
    ).toEqual([]);
  });

  it("ловит смешанные ключи разных Supabase-проектов", () => {
    const errors = deploymentIsolationErrors({
      ...validSupabaseEnv,
      SUPABASE_URL: "https://zyxwvutsrqponmlkjihg.supabase.co",
    });

    expect(errors).toContain(
      "DATABASE_URL и SUPABASE_URL указывают на разные Supabase-проекты",
    );
    expect(errors).toContain(
      "DIRECT_URL и SUPABASE_URL указывают на разные Supabase-проекты",
    );
  });
});
