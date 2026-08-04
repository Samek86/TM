import { useMemo, useState } from "react";
import { ARCHIVE_CATEGORIES, ARCHIVE_ITEMS } from "@/data/archive-catalog";
import { MidiPlayer } from "@/components/tm/MidiPlayer";

function isMidiPath(path: string): boolean {
  return /\.midi?$/i.test(path);
}

export function ArchiveBrowser() {
  const [cat, setCat] = useState<string>("전체");
  const [selected, setSelected] = useState(ARCHIVE_ITEMS[0]?.id ?? "");

  const items = useMemo(
    () =>
      cat === "전체" ? ARCHIVE_ITEMS : ARCHIVE_ITEMS.filter((i) => i.category === cat),
    [cat],
  );
  const current = ARCHIVE_ITEMS.find((i) => i.id === selected) ?? items[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        <div className="flex flex-wrap gap-1.5">
          <CatChip active={cat === "전체"} onClick={() => setCat("전체")}>
            전체
          </CatChip>
          {ARCHIVE_CATEGORIES.map((c) => (
            <CatChip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </CatChip>
          ))}
        </div>
        <ul className="tm-scroll max-h-56 space-y-1 overflow-y-auto rounded-xl border border-tm-border bg-tm-panel/80 p-2 lg:max-h-none lg:flex-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  current?.id === item.id
                    ? "bg-tm-accent/20 text-tm-accent-fg ring-1 ring-tm-accent/40"
                    : "text-tm-muted hover:bg-tm-elevated hover:text-tm-fg"
                }`}
              >
                <div className="font-medium">{item.title}</div>
                <div className="text-xs opacity-70">{item.category}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="tm-scroll min-h-0 flex-1 overflow-y-auto rounded-xl border border-tm-border bg-tm-panel/90 p-4">
        {current ? (
          <div className="flex flex-col gap-4">
            <header>
              <h2 className="font-display text-xl text-tm-fg">{current.title}</h2>
              <p className="mt-1 text-sm text-tm-muted">
                {current.category}
                {current.note ? ` · ${current.note}` : ""}
              </p>
              <p className="mt-1 font-mono text-xs text-tm-dim">{current.path}</p>
            </header>
            <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-tm-border bg-tm-void p-3">
              {current.kind === "image" && (
                <img
                  src={current.path}
                  alt={current.title}
                  className="max-h-[min(60vh,520px)] max-w-full object-contain"
                  crossOrigin="anonymous"
                />
              )}
              {current.kind === "video" && (
                <video
                  src={current.path}
                  controls
                  className="max-h-[min(60vh,520px)] max-w-full"
                  playsInline
                />
              )}
              {current.kind === "audio" && isMidiPath(current.path) && (
                <MidiPlayer
                  key={current.path}
                  src={current.path}
                  title={current.title}
                  loop
                />
              )}
              {current.kind === "audio" && !isMidiPath(current.path) && (
                <audio src={current.path} controls className="w-full max-w-md" />
              )}
              {(current.kind === "document" || current.kind === "binary") && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-tm-muted">
                    {current.kind === "binary"
                      ? "바이너리/원본 파일 — 다운로드하여 보존"
                      : "텍스트/HTML 원문"}
                  </p>
                  <a
                    href={current.path}
                    download
                    className="inline-flex items-center rounded-lg bg-tm-accent px-4 py-2 text-sm font-semibold text-tm-void hover:brightness-110"
                  >
                    파일 열기 / 다운로드
                  </a>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-tm-muted">항목을 선택하세요.</p>
        )}
      </section>
    </div>
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-tm-accent text-tm-void"
          : "bg-tm-elevated text-tm-muted hover:text-tm-fg"
      }`}
    >
      {children}
    </button>
  );
}
