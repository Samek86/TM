import { useEffect, useMemo, useState } from "react";
import { VULTURES } from "@/data/vultures";
import { fetchRanking, useGameAuth } from "@/lib/game-auth";
import type { CraftWin, RankRow, RankingPayload } from "@/lib/game-auth";

type Board = "allTime" | "weekly";

function CraftBars({ crafts }: { crafts: CraftWin[] }) {
  const max = Math.max(1, ...crafts.map((c) => c.wins));
  if (crafts.length === 0) {
    return <p className="text-xs text-tm-dim">아직 기록된 승리가 없습니다</p>;
  }
  return (
    <ul className="space-y-2">
      {VULTURES.map((v) => {
        const row = crafts.find((c) => c.vultureId === v.id);
        const wins = row?.wins ?? 0;
        return (
          <li key={v.id}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold text-tm-fg">{v.name}</span>
              <span className="font-mono text-tm-accent-fg">{wins}승</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tm-elevated">
              <div
                className="h-full rounded-full bg-tm-cyan"
                style={{ width: `${(wins / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LeaderTable({
  rows,
  selected,
  onSelect,
}: {
  rows: RankRow[];
  selected: number | null;
  onSelect: (userId: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-tm-border px-3 py-6 text-center text-sm text-tm-dim">
        아직 랭킹 데이터가 없습니다. 로그인 후 랭킹 대전에서 승리하세요.
      </p>
    );
  }
  return (
    <ol className="space-y-1">
      {rows.map((row) => (
        <li key={row.userId}>
          <button
            type="button"
            onClick={() => onSelect(row.userId)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
              selected === row.userId
                ? "border-tm-cyan bg-tm-cyan/10 text-tm-fg"
                : "border-tm-border bg-tm-elevated/40 text-tm-muted hover:text-tm-fg"
            }`}
          >
            <span
              className={`w-8 shrink-0 font-display text-base ${
                row.rank === 1 ? "text-tm-accent" : "text-tm-dim"
              }`}
            >
              #{row.rank}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {row.username}
            </span>
            <span className="font-mono text-tm-accent-fg">{row.wins}승</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function RankingPanel() {
  const { user } = useGameAuth();
  const [data, setData] = useState<RankingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<Board>("allTime");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRanking()
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
        const first =
          payload.me?.userId ??
          payload.allTime[0]?.userId ??
          payload.weekly[0]?.userId ??
          null;
        setSelectedId(first);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "랭킹을 불러오지 못했습니다");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const rows = board === "allTime" ? (data?.allTime ?? []) : (data?.weekly ?? []);
  const selected = useMemo(() => {
    if (selectedId == null) return null;
    return (
      data?.allTime.find((r) => r.userId === selectedId) ??
      data?.weekly.find((r) => r.userId === selectedId) ??
      null
    );
  }, [data, selectedId]);

  const selectedCrafts: CraftWin[] =
    selected?.crafts ??
    (data?.me && data.me.userId === selectedId ? data.me.crafts : []) ??
    [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-tm-accent-fg">랭킹</h2>
              <p className="mt-1 text-xs text-tm-muted">
                매치 승리 수 · 올타임 / 최근 7일 · 기체별 내역
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["allTime", "올타임"],
                  ["weekly", "주간"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setBoard(id)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    board === id
                      ? "border-tm-cyan bg-tm-cyan/10 text-tm-fg"
                      : "border-tm-border bg-tm-elevated/40 text-tm-muted hover:text-tm-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {data && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Highlight
                label="올타임 #1"
                name={data.allTime[0]?.username ?? "—"}
                wins={data.allTime[0]?.wins ?? 0}
              />
              <Highlight
                label="주간 #1"
                name={data.weekly[0]?.username ?? "—"}
                wins={data.weekly[0]?.wins ?? 0}
              />
            </div>
          )}

          <div className="mt-4">
            {error && <p className="text-sm text-tm-danger">{error}</p>}
            {!data && !error && (
              <p className="text-sm text-tm-muted">랭킹을 불러오는 중…</p>
            )}
            {data && (
              <LeaderTable
                rows={rows}
                selected={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 sm:p-5">
            <h3 className="font-display text-sm text-tm-accent-fg">기체별 승리</h3>
            <p className="mt-1 text-xs text-tm-muted">
              {selected
                ? `${selected.username} · 전체 ${selected.wins}승`
                : data?.me
                  ? `${data.me.username} · 전체 ${data.me.wins}승 / 주간 ${data.me.weeklyWins}승`
                  : "파일럿을 선택하세요"}
            </p>
            <div className="mt-3">
              <CraftBars
                crafts={
                  selectedCrafts.length > 0
                    ? selectedCrafts
                    : (data?.me?.crafts ?? [])
                }
              />
            </div>
          </div>
          {data?.me && (
            <div className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 text-sm text-tm-muted">
              <p className="font-semibold text-tm-fg">내 기록</p>
              <p className="mt-1">
                {data.me.username} · 올타임 {data.me.wins}승 · 주간{" "}
                {data.me.weeklyWins}승
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Highlight({
  label,
  name,
  wins,
}: {
  label: string;
  name: string;
  wins: number;
}) {
  return (
    <div className="rounded-xl border border-tm-border bg-tm-elevated/50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tm-dim">
        {label}
      </p>
      <p className="mt-1 truncate font-display text-tm-fg">{name}</p>
      <p className="font-mono text-xs text-tm-accent-fg">{wins}승</p>
    </div>
  );
}
