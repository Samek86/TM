import type { GameUser, RankingPayload, SessionPayload } from "./types";

export type { GameUser, RankingPayload, SessionPayload };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === "string" && data.error ? data.error : fallback;
}

async function gameFetch(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(errorMessage(data, "요청에 실패했습니다"));
  }
  return data;
}

export async function fetchGameSession(): Promise<GameUser | null> {
  const data = (await gameFetch("/api/game/session")) as SessionPayload;
  return data.user ?? null;
}

export async function loginGameAccount(
  username: string,
  password: string,
): Promise<GameUser> {
  const data = await gameFetch("/api/game/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const user = data.user as GameUser | undefined;
  if (!user) throw new Error("로그인에 실패했습니다");
  return user;
}

export async function signupGameAccount(
  username: string,
  password: string,
): Promise<GameUser> {
  const data = await gameFetch("/api/game/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const user = data.user as GameUser | undefined;
  if (!user) throw new Error("회원가입에 실패했습니다");
  return user;
}

export async function logoutGameAccount(): Promise<void> {
  await gameFetch("/api/game/logout", { method: "POST", body: "{}" });
}

export async function fetchRanking(): Promise<RankingPayload> {
  return (await gameFetch("/api/game/ranking")) as RankingPayload;
}

export async function recordMatchWin(input: {
  vultureId: string;
  mapId: string;
}): Promise<void> {
  await gameFetch("/api/game/wins", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
