/**
 * Game-account HTTP handlers. Server-only — imported from the API route.
 * Passwords are never logged or echoed.
 */
import {
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from "./password";
import { ensureGameDbReady, type GameDb } from "./db";
import {
  createLoginSession,
  deleteSessionByTokenHash,
  findUserByTokenHash,
  findUserByUsername,
  hashToken,
  insertUser,
  insertWin,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "./store";
import { buildRanking } from "./ranking";
import {
  isRateLimited,
  LOGIN_IP_LIMIT,
  LOGIN_USER_LIMIT,
  LOGIN_WINDOW_MS,
  SIGNUP_IP_LIMIT,
  SIGNUP_WINDOW_MS,
  WIN_USER_LIMIT,
  WIN_WINDOW_MS,
} from "./rate-limit";
import { validatePassword, validateUsername } from "./validate";
import {
  isGameMapId,
  isGameVultureId,
  type GameUser,
  type RankingPayload,
  type SessionPayload,
} from "./types";

const GENERIC_LOGIN_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function json(
  body: unknown,
  init: { status?: number; headers?: HeadersInit } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
}

function errorJson(status: number, message: string): Response {
  return json({ error: message }, { status });
}

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  const proto = request.headers.get("x-forwarded-proto");
  return proto?.split(",")[0]?.trim() === "https";
}

function sessionCookieHeader(
  token: string | null,
  secure: boolean,
): string {
  const parts = [
    token
      ? `${SESSION_COOKIE}=${encodeURIComponent(token)}`
      : `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    token ? `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` : "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function assertCsrfSafe(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== url.origin) {
      throw new HttpError(403, "Forbidden");
    }
    return;
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === url.origin) return;
    } catch {
      throw new HttpError(403, "Forbidden");
    }
    throw new HttpError(403, "Forbidden");
  }
  const site = request.headers.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  throw new HttpError(403, "Forbidden");
}

function readSessionUser(db: GameDb, request: Request): GameUser | null {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return findUserByTokenHash(db, hashToken(token)) ?? null;
}

async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "잘못된 요청입니다");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "잘못된 요청입니다");
  }
  return parsed as Record<string, unknown>;
}

function withSessionCookie(
  body: unknown,
  token: string | null,
  request: Request,
  status = 200,
): Response {
  return json(body, {
    status,
    headers: {
      "set-cookie": sessionCookieHeader(token, isSecureRequest(request)),
    },
  });
}

async function handleSignup(db: GameDb, request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (isRateLimited(`signup:ip:${ip}`, SIGNUP_IP_LIMIT, SIGNUP_WINDOW_MS)) {
    throw new HttpError(429, "요청이 너무 많습니다. 잠시 후 다시 시도하세요");
  }
  const body = await readJsonObject(request);
  const username = validateUsername(body.username);
  if (!username.ok) throw new HttpError(400, username.error);
  const password = validatePassword(body.password);
  if (!password.ok) throw new HttpError(400, password.error);

  const passwordHash = await hashPassword(password.value);
  try {
    const user = insertUser(db, username.value, passwordHash);
    const { token } = createLoginSession(db, user.id);
    return withSessionCookie({ user }, token, request, 201);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") {
      throw new HttpError(409, "이미 사용 중인 아이디입니다");
    }
    throw err;
  }
}

async function handleLogin(db: GameDb, request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (isRateLimited(`login:ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS)) {
    throw new HttpError(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요");
  }
  const body = await readJsonObject(request);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  if (!username.ok || !password.ok) {
    throw new HttpError(400, GENERIC_LOGIN_ERROR);
  }
  if (
    isRateLimited(
      `login:user:${username.value.toLowerCase()}`,
      LOGIN_USER_LIMIT,
      LOGIN_WINDOW_MS,
    )
  ) {
    throw new HttpError(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요");
  }

  const user = findUserByUsername(db, username.value);
  const hash = user?.password_hash ?? (await dummyPasswordHash());
  const ok = await verifyPassword(password.value, hash);
  if (!user || !ok) {
    throw new HttpError(401, GENERIC_LOGIN_ERROR);
  }
  const { token } = createLoginSession(db, user.id);
  return withSessionCookie(
    { user: { id: user.id, username: user.username } },
    token,
    request,
  );
}

function handleLogout(db: GameDb, request: Request): Response {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) deleteSessionByTokenHash(db, hashToken(token));
  return withSessionCookie({ ok: true }, null, request);
}

function handleSession(db: GameDb, request: Request): Response {
  const user = readSessionUser(db, request);
  const payload: SessionPayload = { user };
  return json(payload);
}

function handleRanking(db: GameDb, request: Request): Response {
  const user = readSessionUser(db, request);
  const payload: RankingPayload = buildRanking(db, { userId: user?.id ?? null });
  return json(payload);
}

function handleWin(db: GameDb, request: Request, body: Record<string, unknown>): Response {
  const user = readSessionUser(db, request);
  if (!user) throw new HttpError(401, "로그인이 필요합니다");
  if (isRateLimited(`win:user:${user.id}`, WIN_USER_LIMIT, WIN_WINDOW_MS)) {
    throw new HttpError(429, "승리 기록이 너무 잦습니다");
  }
  const vultureId = typeof body.vultureId === "string" ? body.vultureId : "";
  const mapId = typeof body.mapId === "string" ? body.mapId : "";
  if (!isGameVultureId(vultureId) || !isGameMapId(mapId)) {
    throw new HttpError(400, "잘못된 기체 또는 맵입니다");
  }
  insertWin(db, user.id, vultureId, mapId);
  return json({ ok: true });
}

function routeKey(request: Request): string {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${request.method.toUpperCase()} ${path}`;
}

export async function handleGameApi(
  request: Request,
  db: GameDb = ensureGameDbReady(),
): Promise<Response> {
  try {
    assertCsrfSafe(request);
    const key = routeKey(request);
    switch (key) {
      case "POST /api/game/signup":
        return await handleSignup(db, request);
      case "POST /api/game/login":
        return await handleLogin(db, request);
      case "POST /api/game/logout":
        return handleLogout(db, request);
      case "GET /api/game/session":
        return handleSession(db, request);
      case "GET /api/game/ranking":
        return handleRanking(db, request);
      case "POST /api/game/wins":
        return handleWin(db, request, await readJsonObject(request));
      default:
        return errorJson(404, "Not found");
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return errorJson(err.status, err.message);
    }
    console.error(
      "[game-auth] request failed:",
      err instanceof Error ? err.message : "unknown",
    );
    return errorJson(500, "서버 오류가 발생했습니다");
  }
}
