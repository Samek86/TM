import { useCallback, useEffect, useState } from "react";
import { playMidiUrl, stopMidi, isMidiPlaying } from "@/lib/audio/midiPlayer";

interface Props {
  src: string;
  title?: string;
  /** Auto-start when mounted (still requires prior user gesture on the page). */
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
}

export function MidiPlayer({
  src,
  title,
  autoPlay = false,
  loop = true,
  className = "",
}: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const stop = useCallback(() => {
    stopMidi();
    setStatus("idle");
  }, []);

  const play = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const handle = await playMidiUrl(src, { loop, volumeDb: -6 });
      setDuration(handle.duration);
      setStatus("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [src, loop]);

  useEffect(() => {
    // Stop when src changes / unmount
    return () => {
      stopMidi();
    };
  }, [src]);

  useEffect(() => {
    if (autoPlay) void play();
  }, [autoPlay, play]);

  // Sync if something else stopped transport
  useEffect(() => {
    if (status !== "playing") return;
    const id = window.setInterval(() => {
      if (!isMidiPlaying()) setStatus("idle");
    }, 500);
    return () => clearInterval(id);
  }, [status]);

  return (
    <div
      className={`flex w-full max-w-md flex-col gap-3 rounded-xl border border-tm-border bg-tm-elevated/50 p-4 ${className}`}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-tm-dim">
          MIDI BGM
        </p>
        <p className="font-mono text-sm text-tm-fg">{title ?? src.split("/").pop()}</p>
        <p className="mt-1 text-[11px] text-tm-muted">
          Tone.js 앙상블(서브·베이스·패드·플럭·브라스·건반·리드) + 자동 베이스 보강. 원곡 멜로디·타이밍 유지.
          {duration > 0 ? ` · ${duration.toFixed(1)}s` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "playing" ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg bg-tm-danger/90 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            정지
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void play()}
            disabled={status === "loading"}
            className="rounded-lg bg-tm-accent px-4 py-2 text-sm font-semibold text-tm-void hover:brightness-110 disabled:opacity-50"
          >
            {status === "loading" ? "로딩…" : "재생"}
          </button>
        )}
        <a
          href={src}
          download
          className="rounded-lg border border-tm-border bg-tm-panel px-3 py-2 text-sm text-tm-muted hover:text-tm-fg"
        >
          파일 저장
        </a>
      </div>
      {error && <p className="text-xs text-tm-danger">{error}</p>}
    </div>
  );
}
