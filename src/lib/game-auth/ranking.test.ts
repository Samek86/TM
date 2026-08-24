import { describe, expect, it } from "vitest";
import { openMemoryDb } from "./db";
import {
  buildRanking,
  queryAllTimeLeaders,
  queryWeeklyLeaders,
} from "./ranking";
import { insertUser, insertWin, queryCraftWins } from "./store";

function seed() {
  const db = openMemoryDb();
  const ace = insertUser(db, "ace", "hash-ace");
  const bob = insertUser(db, "bob", "hash-bob");
  const chi = insertUser(db, "chi", "hash-chi");
  const now = new Date("2026-08-24T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  insertWin(db, ace.id, "born_armor", "jade_basin", daysAgo(1));
  insertWin(db, ace.id, "born_armor", "scar_ridge", daysAgo(2));
  insertWin(db, ace.id, "sorcerer", "iron_ring", daysAgo(3));
  insertWin(db, ace.id, "killers_pot", "jade_basin", daysAgo(20));
  insertWin(db, ace.id, "born_armor", "jade_basin", daysAgo(40));

  insertWin(db, bob.id, "killers_pot", "scar_ridge", daysAgo(1));
  insertWin(db, bob.id, "killers_pot", "iron_ring", daysAgo(2));
  insertWin(db, bob.id, "sorcerer", "jade_basin", daysAgo(10));

  insertWin(db, chi.id, "sorcerer", "jade_basin", daysAgo(1));

  return { db, ace, bob, chi, now };
}

describe("ranking queries", () => {
  it("ranks all-time by match wins and breaks ties by username", () => {
    const { db } = seed();
    const rows = queryAllTimeLeaders(db);
    expect(rows.map((r) => r.username)).toEqual(["ace", "bob", "chi"]);
    expect(rows[0]).toMatchObject({ rank: 1, wins: 5, username: "ace" });
    expect(rows[1]).toMatchObject({ rank: 2, wins: 3, username: "bob" });
    expect(rows[2]).toMatchObject({ rank: 3, wins: 1, username: "chi" });
  });

  it("counts only wins from the last 7 days for weekly #1", () => {
    const { db, now } = seed();
    const weekly = queryWeeklyLeaders(db, now);
    expect(weekly.map((r) => ({ name: r.username, wins: r.wins }))).toEqual([
      { name: "ace", wins: 3 },
      { name: "bob", wins: 2 },
      { name: "chi", wins: 1 },
    ]);
    expect(weekly[0]?.rank).toBe(1);
  });

  it("breaks down wins per craft for an account", () => {
    const { db, ace } = seed();
    expect(queryCraftWins(db, ace.id)).toEqual([
      { vultureId: "born_armor", wins: 3 },
      { vultureId: "killers_pot", wins: 1 },
      { vultureId: "sorcerer", wins: 1 },
    ]);
  });

  it("attaches craft counts to leaderboard rows and me", () => {
    const { db, ace, now } = seed();
    const payload = buildRanking(db, { userId: ace.id, now });
    expect(payload.allTime[0]?.crafts).toEqual([
      { vultureId: "born_armor", wins: 3 },
      { vultureId: "killers_pot", wins: 1 },
      { vultureId: "sorcerer", wins: 1 },
    ]);
    expect(payload.me).toMatchObject({
      username: "ace",
      wins: 5,
      weeklyWins: 3,
    });
  });

  it("uses bound parameters (values never interpolated into SQL)", () => {
    const db = openMemoryDb();
    const sneaky = insertUser(db, "normal", "hash");
    insertWin(
      db,
      sneaky.id,
      "born_armor",
      "jade_basin",
      "2026-08-01T00:00:00.000Z",
    );
    const injected = "jade_basin'; DROP TABLE users; --";
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM match_wins WHERE map_id = ?")
      .get(injected) as { n: number };
    expect(Number(row.n)).toBe(0);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number },
    ).toEqual({ n: 1 });
  });
});
