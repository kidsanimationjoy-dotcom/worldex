import { createPool } from "mysql2/promise";
import { createApp } from "./app.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createConnectorOAuthService } from "./connector-oauth.mjs";
import { createManusProvider } from "./manus-provider.mjs";
import { createMysqlRepository } from "./repository.mjs";

export function createNetlifyRuntime(env = process.env) {
  if (!env.DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "database_not_configured";
    throw error;
  }

  // Reuse the pool inside a warm function instance, but let idle sockets close
  // before Netlify's 60-second outbound-connection idle limit.
  const pool = createPool(env.DATABASE_URL, {
    waitForConnections: true,
    connectionLimit: 4,
    maxIdle: 2,
    idleTimeout: 30_000,
    queueLimit: 0,
  });

  const repo = createMysqlRepository(pool);
  const manusApiUrl = env.MANUS_API_URL || env.MANUS_OAUTH_API_URL;
  const runtimeEnv = {
    ...env,
    MANUS_API_URL: manusApiUrl || "",
    MANUS_OAUTH_API_URL: env.MANUS_OAUTH_API_URL || manusApiUrl || "",
  };
  const provider = createManusProvider({
    apiUrl: manusApiUrl,
    apiKey: env.MANUS_API_KEY,
    projectId: env.MANUS_PROJECT_ID,
    portalUrl: env.MANUS_OAUTH_PORTAL_URL,
  });
  const auth = createAuthService({ repo, provider, env: runtimeEnv });
  const connections = createConnectorOAuthService({ repo, env: runtimeEnv });
  const app = createApp({
    repo,
    auth,
    provider,
    connections,
    env: runtimeEnv,
    // Netlify serves dist through its static CDN. The function handles API
    // routes only, avoiding filesystem reads from the function bundle.
    staticDirectory: null,
  });

  return { pool, repo, provider, auth, connections, app };
}
