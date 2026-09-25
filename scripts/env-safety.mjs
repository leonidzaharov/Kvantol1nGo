function databaseProjectRef(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const directHost = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    if (directHost?.[1]) return directHost[1].toLowerCase();

    const poolerUser = /^postgres\.([a-z0-9]+)$/i.exec(
      decodeURIComponent(url.username),
    );
    return poolerUser?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function apiProjectRef(value) {
  if (!value) return null;
  try {
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(new URL(value).hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function deploymentIsolationErrors(env) {
  const errors = [];
  const databaseRef = databaseProjectRef(env.DATABASE_URL);
  const directRef = databaseProjectRef(env.DIRECT_URL);
  const supabaseRef = apiProjectRef(env.SUPABASE_URL);

  if (databaseRef && directRef && databaseRef !== directRef) {
    errors.push("DATABASE_URL и DIRECT_URL указывают на разные Supabase-проекты");
  }
  if (databaseRef && supabaseRef && databaseRef !== supabaseRef) {
    errors.push("DATABASE_URL и SUPABASE_URL указывают на разные Supabase-проекты");
  }
  if (directRef && supabaseRef && directRef !== supabaseRef) {
    errors.push("DIRECT_URL и SUPABASE_URL указывают на разные Supabase-проекты");
  }

  if (env.VERCEL_ENV === "preview") {
    if (env.KVANTO_DEPLOYMENT_ENV !== "staging") {
      errors.push(
        "Vercel Preview требует KVANTO_DEPLOYMENT_ENV=staging до запуска миграций",
      );
    }
    if (env.STAGING_DATABASE_CONFIRM !== "isolated-test-data") {
      errors.push(
        "Vercel Preview требует STAGING_DATABASE_CONFIRM=isolated-test-data",
      );
    }
  }

  if (
    env.VERCEL_ENV === "production" &&
    env.KVANTO_DEPLOYMENT_ENV &&
    env.KVANTO_DEPLOYMENT_ENV !== "production"
  ) {
    errors.push("Vercel Production не может использовать staging-конфигурацию");
  }

  return errors;
}
