import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchGameSession,
  loginGameAccount,
  logoutGameAccount,
  signupGameAccount,
} from "./client";
import type { GameUser } from "./types";

export type GameAuthContextValue = {
  user: GameUser | null;
  isPending: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const GameAuthContext = createContext<GameAuthContextValue | null>(null);

export function GameAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GameUser | null>(null);
  const [isPending, setIsPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchGameSession();
      setUser(next);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : "세션을 확인하지 못했습니다");
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    const next = await loginGameAccount(username, password);
    setUser(next);
  }, []);

  const signup = useCallback(async (username: string, password: string) => {
    setError(null);
    const next = await signupGameAccount(username, password);
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    await logoutGameAccount();
    setUser(null);
  }, []);

  const value = useMemo<GameAuthContextValue>(
    () => ({ user, isPending, error, login, signup, logout, refresh }),
    [user, isPending, error, login, signup, logout, refresh],
  );

  return (
    <GameAuthContext.Provider value={value}>{children}</GameAuthContext.Provider>
  );
}

export function useGameAuth(): GameAuthContextValue {
  const ctx = useContext(GameAuthContext);
  if (!ctx) {
    throw new Error("useGameAuth must be used within GameAuthProvider");
  }
  return ctx;
}
