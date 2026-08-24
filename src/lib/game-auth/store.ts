import { createHash, randomBytes } from "node:crypto";
import type { GameDb } from "./db";
import type { CraftWin, GameUser } from "./types";

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "tm_session";

export type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export function nowIso(at = new Date()): string {
  return at.toISOString();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function insertUser(
  db: GameDb,
  username: string,
  passwordHash: string,
  createdAt = nowIso(),
): GameUser {
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
    )
    .run(username, passwordHash, createdAt);
  return { id: Number(result.lastInsertRowid), username };
}

export function findUserByUsername(
  db: GameDb,
  username: string,
): UserRow | undefined {
  return db
    .prepare(
      "SELECT id, username, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE",
    )
    .get(username) as UserRow | undefined;
}

export function findUserById(db: GameDb, id: number): GameUser | undefined {
  return db
    .prepare("SELECT id, username FROM users WHERE id = ?")
    .get(id) as GameUser | undefined;
}

export function insertSession(
  db: GameDb,
  userId: number,
  tokenHash: string,
  expiresAt: string,
): void {
  db.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
  ).run(userId, tokenHash, expiresAt);
}

export function deleteExpiredSessions(db: GameDb, now = nowIso()): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
}

export function deleteSessionByTokenHash(db: GameDb, tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function findUserByTokenHash(
  db: GameDb,
  tokenHash: string,
  now = nowIso(),
): GameUser | undefined {
  return db
    .prepare(
      `SELECT u.id, u.username
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at >= ?`,
    )
    .get(tokenHash, now) as GameUser | undefined;
}

export function insertWin(
  db: GameDb,
  userId: number,
  vultureId: string,
  mapId: string,
  wonAt = nowIso(),
): void {
  db.prepare(
    "INSERT INTO match_wins (user_id, vulture_id, map_id, won_at) VALUES (?, ?, ?, ?)",
  ).run(userId, vultureId, mapId, wonAt);
}

export function createLoginSession(
  db: GameDb,
  userId: number,
  ttlMs = SESSION_TTL_MS,
  at = new Date(),
): { token: string; expiresAt: string } {
  deleteExpiredSessions(db, nowIso(at));
  const token = newSessionToken();
  const expiresAt = new Date(at.getTime() + ttlMs).toISOString();
  insertSession(db, userId, hashToken(token), expiresAt);
  return { token, expiresAt };
}

export function queryCraftWins(db: GameDb, userId: number): CraftWin[] {
  const rows = db
    .prepare(
      `SELECT vulture_id AS vultureId, COUNT(*) AS wins
       FROM match_wins
       WHERE user_id = ?
       GROUP BY vulture_id
       ORDER BY wins DESC, vulture_id ASC`,
    )
    .all(userId) as { vultureId: string; wins: number }[];
  return rows.map((row) => ({
    vultureId: row.vultureId,
    wins: Number(row.wins),
  }));
}

export function countWins(db: GameDb, userId: number, sinceIso?: string): number {
  if (sinceIso) {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS wins FROM match_wins WHERE user_id = ? AND won_at >= ?",
      )
      .get(userId, sinceIso) as { wins: number };
    return Number(row.wins);
  }
  const row = db
    .prepare("SELECT COUNT(*) AS wins FROM match_wins WHERE user_id = ?")
    .get(userId) as { wins: number };
  return Number(row.wins);
}

export function queryCraftWinsForUsers(
  db: GameDb,
  userIds: number[],
): Map<number, CraftWin[]> {
  const map = new Map<number, CraftWin[]>();
  for (const id of userIds) {
    map.set(id, queryCraftWins(db, id));
  }
  return map;
}
