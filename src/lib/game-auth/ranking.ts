import type { GameDb } from "./db";
import { countWins, findUserById, queryCraftWins, queryCraftWinsForUsers } from "./store";
import type { MeRanking, RankRow } from "./types";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const RANKING_LIMIT = 20;

type LeaderSqlRow = { userId: number; username: string; wins: number };

function leaderRows(
  db: GameDb,
  sinceIso: string | null,
  limit: number,
): LeaderSqlRow[] {
  if (sinceIso) {
    return db
      .prepare(
        `SELECT u.id AS userId, u.username AS username, COUNT(*) AS wins
         FROM match_wins w
         INNER JOIN users u ON u.id = w.user_id
         WHERE w.won_at >= ?
         GROUP BY u.id
         ORDER BY wins DESC, u.username COLLATE NOCASE ASC
         LIMIT ?`,
      )
      .all(sinceIso, limit) as LeaderSqlRow[];
  }
  return db
    .prepare(
      `SELECT u.id AS userId, u.username AS username, COUNT(*) AS wins
       FROM match_wins w
       INNER JOIN users u ON u.id = w.user_id
       GROUP BY u.id
       ORDER BY wins DESC, u.username COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .all(limit) as LeaderSqlRow[];
}

function toRankRows(db: GameDb, rows: LeaderSqlRow[]): RankRow[] {
  const crafts = queryCraftWinsForUsers(
    db,
    rows.map((row) => row.userId),
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    username: row.username,
    wins: Number(row.wins),
    crafts: crafts.get(row.userId) ?? [],
  }));
}

export function queryAllTimeLeaders(
  db: GameDb,
  limit = RANKING_LIMIT,
): RankRow[] {
  return toRankRows(db, leaderRows(db, null, limit));
}

export function queryWeeklyLeaders(
  db: GameDb,
  now = new Date(),
  limit = RANKING_LIMIT,
): RankRow[] {
  const sinceIso = new Date(now.getTime() - WEEK_MS).toISOString();
  return toRankRows(db, leaderRows(db, sinceIso, limit));
}

export function queryMeRanking(
  db: GameDb,
  userId: number,
  now = new Date(),
): MeRanking | null {
  const user = findUserById(db, userId);
  if (!user) return null;
  const sinceIso = new Date(now.getTime() - WEEK_MS).toISOString();
  return {
    userId: user.id,
    username: user.username,
    wins: countWins(db, user.id),
    weeklyWins: countWins(db, user.id, sinceIso),
    crafts: queryCraftWins(db, user.id),
  };
}

export function buildRanking(
  db: GameDb,
  opts: { userId?: number | null; now?: Date; limit?: number } = {},
): { allTime: RankRow[]; weekly: RankRow[]; me: MeRanking | null } {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? RANKING_LIMIT;
  return {
    allTime: queryAllTimeLeaders(db, limit),
    weekly: queryWeeklyLeaders(db, now, limit),
    me:
      opts.userId != null ? queryMeRanking(db, opts.userId, now) : null,
  };
}
