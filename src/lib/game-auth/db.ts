/**
 * SQLite game-account DB (users / sessions / match_wins).
 * Separate from Better Auth / PGLite — do not import this from client code.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type BetterSqlite3 from "better-sqlite3";

export type GameDb = BetterSqlite3.Database;

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

export const DEFAULT_SQLITE_PATH = join(process.cwd(), "data", "tm.sqlite");

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_game_accounts.sql",
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (username)
      );

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE match_wins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        vulture_id TEXT NOT NULL,
        map_id TEXT NOT NULL,
        won_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX idx_wins_user ON match_wins(user_id);
      CREATE INDEX idx_wins_won_at ON match_wins(won_at);
      CREATE INDEX idx_wins_user_vulture ON match_wins(user_id, vulture_id);
    `,
  },
];

function configure(db: GameDb): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
}

export function migrate(db: GameDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    db
      .prepare("SELECT name FROM game_migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO game_migrations (name, applied_at) VALUES (?, ?)").run(
        migration.name,
        new Date().toISOString(),
      );
    });
    apply();
  }
}

export function openGameDb(filePath: string): GameDb {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  configure(db);
  migrate(db);
  return db;
}

export function openMemoryDb(): GameDb {
  const db = new Database(":memory:");
  configure(db);
  migrate(db);
  return db;
}

const globalRef = globalThis as typeof globalThis & {
  __tmGameDb__?: GameDb;
};

export function sqlitePath(): string {
  const fromEnv = process.env.TM_SQLITE_PATH?.trim();
  return fromEnv || DEFAULT_SQLITE_PATH;
}

/**
 * Process-wide file DB. Schema is applied on first open (server start / first request).
 */
export function getGameDb(): GameDb {
  if (typeof window !== "undefined") {
    throw new Error("game-auth SQLite is server-only");
  }
  if (!globalRef.__tmGameDb__) {
    globalRef.__tmGameDb__ = openGameDb(sqlitePath());
  }
  return globalRef.__tmGameDb__;
}

export function ensureGameDbReady(): GameDb {
  return getGameDb();
}
