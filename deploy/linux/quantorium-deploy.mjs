import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = {
  repository: "/opt/quantorium/repository",
  releases: "/opt/quantorium/releases",
  current: "/opt/quantorium/current",
  marker: "/var/lib/quantorium/deployed-commit",
  uploads: "/var/lib/quantorium/uploads",
  backups: "/var/backups/quantorium",
  appUser: "quantorium",
  branch: "production",
  healthUrl: "http://127.0.0.1:3100/api/health",
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${result.stderr?.trim() || result.stdout?.trim() || ""}`
      : "";
    throw new Error(`${command} завершился с кодом ${result.status}${detail}`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function runAs(user, cwd, command, args) {
  run("runuser", ["--user", user, "--", command, ...args], { cwd });
}

function loadEnvironmentFile(file = "/etc/quantorium.env") {
  if (!existsSync(file)) return;
  for (const sourceLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function replaceSymlink(linkPath, target) {
  const temporary = `${linkPath}.next`;
  rmSync(temporary, { force: true });
  symlinkSync(target, temporary, "dir");
  renameSync(temporary, linkPath);
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runDeployment(system) {
  const target = await system.fetchTarget();
  const current = await system.currentCommit();
  if (target === current) return { status: "current", commit: target };

  await system.prepareRelease(target);
  await system.installDependencies(target);
  await system.generatePrisma(target);
  await system.checkEnvironment(target);
  await system.buildApplication(target);
  await system.backupDatabase(target);
  await system.backupUploads(target);
  await system.migrateDatabase(target);
  await system.activateRelease(target);
  await system.restartApplication();

  if (!(await system.healthCheck())) {
    await system.rollbackRelease();
    await system.restartApplication();
    throw new Error("Новая версия не прошла проверку здоровья");
  }

  await system.markDeployed(target);
  return { status: "deployed", commit: target };
}

export function createLinuxSystem(config = {}) {
  const settings = { ...DEFAULTS, ...config };
  let previousRelease = null;
  const releasePath = (commit) => path.join(settings.releases, commit);
  const inRelease = (commit, command, args) =>
    runAs(settings.appUser, releasePath(commit), command, args);

  return {
    async fetchTarget() {
      run("git", ["-C", settings.repository, "fetch", "--prune", "origin", settings.branch]);
      return run(
        "git",
        ["-C", settings.repository, "rev-parse", `origin/${settings.branch}`],
        { capture: true },
      );
    },
    async currentCommit() {
      return existsSync(settings.marker)
        ? readFileSync(settings.marker, "utf8").trim()
        : null;
    },
    async prepareRelease(commit) {
      mkdirSync(settings.releases, { recursive: true });
      const destination = releasePath(commit);
      if (!existsSync(destination)) {
        run("git", ["-C", settings.repository, "worktree", "prune"]);
        run("git", ["-C", settings.repository, "worktree", "add", "--detach", destination, commit]);
        run("chown", ["-R", `${settings.appUser}:${settings.appUser}`, destination]);
      }
    },
    async installDependencies(commit) {
      inRelease(commit, "npm", ["ci", "--include=dev"]);
    },
    async generatePrisma(commit) {
      inRelease(commit, "npx", ["prisma", "generate"]);
    },
    async checkEnvironment(commit) {
      inRelease(commit, "npm", ["run", "check-env"]);
    },
    async buildApplication(commit) {
      inRelease(commit, "npm", ["run", "build"]);
    },
    async backupDatabase() {
      const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("DATABASE_URL/DIRECT_URL не задан");
      mkdirSync(settings.backups, { recursive: true, mode: 0o700 });
      const output = path.join(settings.backups, `database-${timestamp()}.dump`);
      run("pg_dump", ["--dbname", databaseUrl, "--format=custom", "--file", output]);
      chmodSync(output, 0o600);
    },
    async backupUploads() {
      mkdirSync(settings.backups, { recursive: true, mode: 0o700 });
      if (!existsSync(settings.uploads)) return;
      const output = path.join(settings.backups, `uploads-${timestamp()}.tar.gz`);
      run("tar", ["-czf", output, "-C", settings.uploads, "."]);
      chmodSync(output, 0o600);
    },
    async migrateDatabase(commit) {
      inRelease(commit, "npx", ["prisma", "migrate", "deploy"]);
    },
    async activateRelease(commit) {
      if (existsSync(settings.current) && lstatSync(settings.current).isSymbolicLink()) {
        previousRelease = readlinkSync(settings.current);
      }
      replaceSymlink(settings.current, releasePath(commit));
    },
    async restartApplication() {
      run("systemctl", ["restart", "quantorium.service"]);
    },
    async healthCheck() {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const result = spawnSync(
          "curl",
          ["-fsS", "--max-time", "3", settings.healthUrl],
          { stdio: "ignore" },
        );
        if (result.status === 0) return true;
        await sleep(2500);
      }
      return false;
    },
    async rollbackRelease() {
      if (!previousRelease) {
        throw new Error("Нет предыдущей версии для отката");
      }
      replaceSymlink(settings.current, previousRelease);
    },
    async markDeployed(commit) {
      mkdirSync(path.dirname(settings.marker), { recursive: true });
      writeFileSync(settings.marker, `${commit}\n`, { mode: 0o600 });
    },
  };
}

async function main() {
  if (process.platform !== "linux" || process.getuid?.() !== 0) {
    throw new Error("Автодеплой должен запускаться root-службой на Linux");
  }
  loadEnvironmentFile();
  const result = await runDeployment(createLinuxSystem());
  console.log(
    result.status === "current"
      ? `Изменений нет: ${result.commit}`
      : `Установлена версия: ${result.commit}`,
  );
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
