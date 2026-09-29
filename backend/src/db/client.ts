import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import * as schema from "./schema.ts";

export type Db = SqliteRemoteDatabase<typeof schema>;

const MIGRATIONS = new URL("../../drizzle", import.meta.url).pathname;

function bindable(params: unknown[]): SQLInputValue[] {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value as SQLInputValue;
  });
}

export async function openDatabase(dataDir: string): Promise<{ db: Db; sqlite: DatabaseSync }> {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(join(dataDir, "app.db"), { timeout: 5000 });
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");

  const db = drizzle(
    async (query, params, method) => {
      const statement = sqlite.prepare(query);
      const args = bindable(params);
      if (method === "run") {
        statement.run(...args);
        return { rows: [] };
      }
      statement.setReturnArrays(true);
      if (method === "get") {
        const row = statement.get(...args);
        return { rows: (row ?? undefined) as unknown as unknown[] };
      }
      return { rows: statement.all(...args) as unknown as unknown[][] };
    },
    { schema },
  );

  await migrate(
    db,
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        for (const query of queries) sqlite.exec(query);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { migrationsFolder: MIGRATIONS },
  );

  return { db, sqlite };
}
