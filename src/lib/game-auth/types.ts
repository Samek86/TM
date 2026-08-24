/** Shared game-account types (safe for client + server). */

export type GameUser = {
  id: number;
  username: string;
};

export type CraftWin = {
  vultureId: string;
  wins: number;
};

export type RankRow = {
  rank: number;
  userId: number;
  username: string;
  wins: number;
  crafts: CraftWin[];
};

export type MeRanking = {
  userId: number;
  username: string;
  wins: number;
  weeklyWins: number;
  crafts: CraftWin[];
};

export type RankingPayload = {
  allTime: RankRow[];
  weekly: RankRow[];
  me: MeRanking | null;
};

export type SessionPayload = {
  user: GameUser | null;
};

export const GAME_VULTURE_IDS = [
  "born_armor",
  "killers_pot",
  "sorcerer",
] as const;

export type GameVultureId = (typeof GAME_VULTURE_IDS)[number];

export const GAME_MAP_IDS = [
  "jade_basin",
  "scar_ridge",
  "iron_ring",
] as const;

export type GameMapId = (typeof GAME_MAP_IDS)[number];

export function isGameVultureId(value: string): value is GameVultureId {
  return (GAME_VULTURE_IDS as readonly string[]).includes(value);
}

export function isGameMapId(value: string): value is GameMapId {
  return (GAME_MAP_IDS as readonly string[]).includes(value);
}
