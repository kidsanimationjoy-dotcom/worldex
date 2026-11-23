import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "mysql2/promise";

const migrationsDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));

export async function runMigrations(pool, directory = migrationsDirectory) {
  const connection = await pool.getConnection();
  const lockName = "worldex:migrations:v1";
  try {
    const [locks] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number(locks[0]?.acquired) !== 1) throw new Error("Could not acquire database migration lock");
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(200) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    const names = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
    for (const name of names) {
      const [rows] = await connection.execute("SELECT migration_name FROM schema_migrations WHERE migration_name = ?", [name]);
      if (rows.length) continue;
      const source = await readFile(join(directory, name), "utf8");
      const statements = source.split(";").map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) await connection.query(statement);
      await connection.execute("INSERT INTO schema_migrations (migration_name) VALUES (?)", [basename(name)]);
    }
    return names;
  } finally {
    try { await connection.query("SELECT RELEASE_LOCK(?)", [lockName]); } catch {}
    connection.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to run migrations");
  const pool = createPool(process.env.DATABASE_URL);
  try {
    const applied = await runMigrations(pool);
    console.log(`Migration check complete (${applied.length} migration file(s) present).`);
  } finally { await pool.end(); }
}
