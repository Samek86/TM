import { afterEach, describe, expect, it } from "vitest";
import { handleGameApi } from "./http.server";
import { openMemoryDb } from "./db";
import { resetRateLimits } from "./rate-limit";

afterEach(() => {
  resetRateLimits();
});

function req(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string; origin?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  return new Request(`http://localhost:8080${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

function cookieFrom(res: Response): string | null {
  const header = res.headers.get("set-cookie");
  if (!header) return null;
  const match = /tm_session=([^;]*)/.exec(header);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

describe("game-auth HTTP", () => {
  it("signs up, logs in, records a ranked win, and ranks the account", async () => {
    const db = openMemoryDb();
    const signup = await handleGameApi(
      req("POST", "/api/game/signup", {
        body: { username: "ace", password: "hunter22" },
        origin: "http://localhost:8080",
      }),
      db,
    );
    expect(signup.status).toBe(201);
    const created = (await signup.json()) as { user: { username: string } };
    expect(created.user.username).toBe("ace");
    const token = cookieFrom(signup);
    expect(token).toBeTruthy();
    expect(signup.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(signup.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);

    const win = await handleGameApi(
      req("POST", "/api/game/wins", {
        body: { vultureId: "born_armor", mapId: "jade_basin" },
        cookie: `tm_session=${token}`,
        origin: "http://localhost:8080",
      }),
      db,
    );
    expect(win.status).toBe(200);

    const ranking = await handleGameApi(
      req("GET", "/api/game/ranking", { cookie: `tm_session=${token}` }),
      db,
    );
    const payload = await ranking.json();
    expect(payload.allTime[0]).toMatchObject({
      rank: 1,
      username: "ace",
      wins: 1,
    });
    expect(payload.allTime[0].crafts).toEqual([
      { vultureId: "born_armor", wins: 1 },
    ]);
    expect(payload.me).toMatchObject({ username: "ace", wins: 1, weeklyWins: 1 });
  });

  it("rejects a short password and never stores it", async () => {
    const db = openMemoryDb();
    const res = await handleGameApi(
      req("POST", "/api/game/signup", {
        body: { username: "ace", password: "short" },
        origin: "http://localhost:8080",
      }),
      db,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("short");
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number },
    ).toEqual({ n: 0 });
  });

  it("rejects a guest win and a cross-origin POST", async () => {
    const db = openMemoryDb();
    const guest = await handleGameApi(
      req("POST", "/api/game/wins", {
        body: { vultureId: "born_armor", mapId: "jade_basin" },
        origin: "http://localhost:8080",
      }),
      db,
    );
    expect(guest.status).toBe(401);

    const csrf = await handleGameApi(
      req("POST", "/api/game/login", {
        body: { username: "ace", password: "hunter22" },
        origin: "https://evil.example",
      }),
      db,
    );
    expect(csrf.status).toBe(403);
  });
});
