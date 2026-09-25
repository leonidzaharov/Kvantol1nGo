import { describe, expect, it } from "vitest";

import { runDeployment } from "./quantorium-deploy.mjs";

function fakeSystem({ current = "old", target = "new", healthy = true } = {}) {
  const events = [];
  const record = (name, result) => async (...args) => {
    events.push([name, ...args]);
    return result;
  };

  return {
    events,
    system: {
      fetchTarget: record("fetchTarget", target),
      currentCommit: record("currentCommit", current),
      prepareRelease: record("prepareRelease"),
      installDependencies: record("installDependencies"),
      generatePrisma: record("generatePrisma"),
      checkEnvironment: record("checkEnvironment"),
      buildApplication: record("buildApplication"),
      backupDatabase: record("backupDatabase"),
      backupUploads: record("backupUploads"),
      migrateDatabase: record("migrateDatabase"),
      activateRelease: record("activateRelease"),
      restartApplication: record("restartApplication"),
      healthCheck: record("healthCheck", healthy),
      rollbackRelease: record("rollbackRelease"),
      markDeployed: record("markDeployed"),
    },
  };
}

describe("automatic Debian deployment", () => {
  it("does nothing when production already points to the deployed commit", async () => {
    const { system, events } = fakeSystem({ current: "same", target: "same" });

    await expect(runDeployment(system)).resolves.toEqual({
      status: "current",
      commit: "same",
    });
    expect(events).toEqual([
      ["fetchTarget"],
      ["currentCommit"],
    ]);
  });

  it("builds, backs up, migrates and activates a new production commit", async () => {
    const { system, events } = fakeSystem();

    await expect(runDeployment(system)).resolves.toEqual({
      status: "deployed",
      commit: "new",
    });
    expect(events.map(([name]) => name)).toEqual([
      "fetchTarget",
      "currentCommit",
      "prepareRelease",
      "installDependencies",
      "generatePrisma",
      "checkEnvironment",
      "buildApplication",
      "backupDatabase",
      "backupUploads",
      "migrateDatabase",
      "activateRelease",
      "restartApplication",
      "healthCheck",
      "markDeployed",
    ]);
    expect(events.at(-1)).toEqual(["markDeployed", "new"]);
  });

  it("restores the previous application release when health check fails", async () => {
    const { system, events } = fakeSystem({ healthy: false });

    await expect(runDeployment(system)).rejects.toThrow(
      "Новая версия не прошла проверку здоровья",
    );
    expect(events.map(([name]) => name)).toEqual([
      "fetchTarget",
      "currentCommit",
      "prepareRelease",
      "installDependencies",
      "generatePrisma",
      "checkEnvironment",
      "buildApplication",
      "backupDatabase",
      "backupUploads",
      "migrateDatabase",
      "activateRelease",
      "restartApplication",
      "healthCheck",
      "rollbackRelease",
      "restartApplication",
    ]);
  });
});
