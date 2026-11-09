import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { runtimeConfig } from "./config.ts";
import { authOptions } from "./auth-options.ts";
let auth: ReturnType<typeof betterAuth> | undefined;
export function authentication() {
  if (!auth) {
    const c = runtimeConfig();
    auth = betterAuth(
      authOptions(new Pool({ connectionString: c.authDatabaseUrl, max: 5 })),
    );
  }
  return auth;
}
