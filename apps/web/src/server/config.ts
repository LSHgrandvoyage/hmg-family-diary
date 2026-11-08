export type RuntimeConfig = {
  origin: string;
  databaseUrl: string;
  authDatabaseUrl: string;
  authSecret: string;
  audioRoot: string;
};
/** Validate at server start; never import this module into a client component. */
export function runtimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Missing server setting: ${name}`);
    return value;
  };
  const origin = required("APP_ORIGIN");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    env.BETTER_AUTH_URL !== origin
  )
    throw new Error(
      "APP_ORIGIN and BETTER_AUTH_URL must be the same HTTPS origin",
    );
  const authSecret = required("BETTER_AUTH_SECRET");
  if (authSecret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
  if (env.AUDIO_STORE !== "local") throw new Error("Unsupported AUDIO_STORE");
  if (
    Object.keys(env).some(
      (k) =>
        k.startsWith("NEXT_PUBLIC_") &&
        /SECRET|PASSWORD|DATABASE|OPENAI_API_KEY/.test(k),
    )
  )
    throw new Error("Server secrets must not be public");
  return {
    origin,
    databaseUrl: required("DATABASE_URL"),
    authDatabaseUrl: required("AUTH_DATABASE_URL"),
    authSecret,
    audioRoot: required("AUDIO_ROOT"),
  };
}
