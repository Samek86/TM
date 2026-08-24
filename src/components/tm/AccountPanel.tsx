import { useState, type FormEvent } from "react";
import { useGameAuth } from "@/lib/game-auth";

type Mode = "login" | "signup";

export function AccountPanel({ compact = false }: { compact?: boolean }) {
  const { user, isPending, login, signup, logout } = useGameAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "login") await login(username, password);
      else await signup(username, password);
      setPassword("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  if (isPending) {
    return (
      <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 text-sm text-tm-muted">
        계정 확인 중…
      </section>
    );
  }

  if (user) {
    return (
      <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tm-dim">
          파일럿
        </p>
        <p className="mt-1 font-display text-lg text-tm-accent-fg">{user.username}</p>
        <p className="mt-1 text-xs text-tm-muted">
          랭킹 대전 ON · 승리 시 기체별 기록이 저장됩니다
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 rounded-lg border border-tm-border px-3 py-1.5 text-xs font-semibold text-tm-muted hover:text-tm-fg"
        >
          로그아웃
        </button>
      </section>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-tm-border bg-tm-panel/90 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm text-tm-accent-fg">
          {mode === "login" ? "로그인" : "회원가입"}
        </h3>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage(null);
          }}
          className="text-xs font-semibold text-tm-cyan hover:underline"
        >
          {mode === "login" ? "회원가입" : "로그인으로"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-tm-dim">
        게스트도 연습 대전 가능 · 로그인하면 랭킹에 승리가 기록됩니다
      </p>
      <form className="mt-3 space-y-2" onSubmit={(e) => void onSubmit(e)}>
        <label className="block">
          <span className="sr-only">아이디</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디 (3–20자)"
            maxLength={20}
            className="w-full rounded-lg border border-tm-border bg-tm-elevated px-3 py-2 text-sm text-tm-fg placeholder:text-tm-dim"
          />
        </label>
        <label className="block">
          <span className="sr-only">비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (8자 이상)"
            maxLength={128}
            className="w-full rounded-lg border border-tm-border bg-tm-elevated px-3 py-2 text-sm text-tm-fg placeholder:text-tm-dim"
          />
        </label>
        {message && <p className="text-xs text-tm-danger">{message}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-tm-accent px-3 py-2 text-sm font-bold text-tm-void hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </form>
    </section>
  );
}
