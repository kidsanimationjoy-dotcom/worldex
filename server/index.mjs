import { createServer } from "node:http";
import { createPool } from "mysql2/promise";
import { createApp } from "./app.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createManusProvider } from "./manus-provider.mjs";
import { runMigrations } from "./migrate.mjs";
import { createMysqlRepository } from "./repository.mjs";
import { startTaskWorker } from "./worker.mjs";

const env = process.env;
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required; refusing to start without persistent storage");
const pool = createPool(env.DATABASE_URL);
// Schema changes must never be applied implicitly to the shared managed database. Review db/migrations/*.sql,
// obtain approval, then run `pnpm db:migrate` (or set WORLDEX_AUTO_MIGRATE=1 for a disposable local database only).
if (env.WORLDEX_AUTO_MIGRATE === "1") {
  console.warn("WORLDEX_AUTO_MIGRATE=1: applying pending migrations");
  await runMigrations(pool);
} else {
  console.log("Automatic migrations are disabled. Run `pnpm db:migrate` after SQL review and approval.");
}
const repo = createMysqlRepository(pool);
const provider = createManusProvider({ apiUrl: env.MANUS_API_URL, apiKey: env.MANUS_API_KEY, projectId: env.MANUS_PROJECT_ID, portalUrl: env.MANUS_OAUTH_PORTAL_URL });
const auth = createAuthService({ repo, provider, env });
const app = createApp({ repo, auth, provider, env });
const port = Number(env.API_PORT ?? (env.PORT ? env.PORT : 3001));
const host = env.PORT ? "0.0.0.0" : "127.0.0.1";
const server = createServer(app);
server.requestTimeout = 60000;
server.headersTimeout = 65000;
server.keepAliveTimeout = 5000;
const stopWorker = startTaskWorker({ repo, provider });
server.listen(port, host, () => console.log(`WORLDEX API listening on ${host}:${port}`));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`WORLDEX API stopping (${signal})`);
  await stopWorker();
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
