import { describe, expect, it } from "vitest";

import { deploymentIsolationErrors } from "./env-safety.mjs";

const validEnv = {
  DATABASE_URL: "postgresql://app:secret@127.0.0.1:5432/quantorium",
  DIRECT_URL: "postgresql://app:secret@127.0.0.1:5432/quantorium",
};

describe("deploymentIsolationErrors", () => {
  it("разрешает согласованное локальное окружение", () => {
    expect(deploymentIsolationErrors(validEnv)).toEqual([]);
  });

  it("разрешает pooler/direct с разными хостами, но одной базой", () => {
    expect(
      deploymentIsolationErrors({
        DATABASE_URL: "postgresql://app:s@127.0.0.1:6432/quantorium",
        DIRECT_URL: "postgresql://app:s@192.168.1.10:5432/quantorium",
      }),
    ).toEqual([]);
  });

  it("ловит разные базы в DATABASE_URL и DIRECT_URL", () => {
    expect(
      deploymentIsolationErrors({
        DATABASE_URL: "postgresql://app:s@127.0.0.1:5432/quantorium",
        DIRECT_URL: "postgresql://app:s@127.0.0.1:5432/other_db",
      }),
    ).toEqual(["DATABASE_URL и DIRECT_URL указывают на разные базы"]);
  });

  it("останавливает staging без явного подтверждения изолированной базы", () => {
    expect(
      deploymentIsolationErrors({
        ...validEnv,
        KVANTO_DEPLOYMENT_ENV: "staging",
      }),
    ).toEqual([
      "Staging требует STAGING_DATABASE_CONFIRM=isolated-test-data до запуска миграций/сидов",
    ]);
  });

  it("разрешает staging с подтверждением", () => {
    expect(
      deploymentIsolationErrors({
        ...validEnv,
        KVANTO_DEPLOYMENT_ENV: "staging",
        STAGING_DATABASE_CONFIRM: "isolated-test-data",
      }),
    ).toEqual([]);
  });
});
