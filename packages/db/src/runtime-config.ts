function optional(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  return value || undefined;
}

/** Central environment boundary for database commands and connections. */
export function databaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  const url = optional(environment, "DATABASE_URL");
  if (!url || (!url.startsWith("postgres://") && !url.startsWith("postgresql://"))) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string");
  }
  return url;
}

export function seedRuntimeConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {
    demoUsersJson: optional(environment, "SEED_DEMO_USERS_JSON"),
    password: optional(environment, "SEED_PASSWORD"),
  };
}
