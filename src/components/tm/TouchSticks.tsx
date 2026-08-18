import { useCallback, useRef, useState } from "react";
import { stickFromPointer, type StickVec } from "@/game/touchStick";

function ThumbStick({
  label,
  hint,
  accent,
  onChange,
  onHeld,
}: {
  label: string;
  hint: string;
  accent: string;
  onChange: (vec: StickVec | null) => void;
  onHeld?: (held: boolean) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const heldRef = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);

  const apply = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const vec = stickFromPointer(
        box.left + box.width / 2,
        box.top + box.height / 2,
        clientX,
        clientY,
        box.width / 2,
      );
      setKnob(vec);
      onChange(vec);
    },
    [onChange],
  );

  const release = useCallback(() => {
    heldRef.current = false;
    setHeld(false);
    setKnob({ x: 0, y: 0 });
    onChange(null);
    onHeld?.(false);
  }, [onChange, onHeld]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={padRef}
        className="relative h-32 w-32 touch-none rounded-full border border-white/25 bg-black/45 shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        style={{ boxShadow: held ? `0 0 22px ${accent}` : undefined }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          heldRef.current = true;
          setHeld(true);
          onHeld?.(true);
          apply(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!heldRef.current) return;
          apply(e.clientX, e.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white/80"
          style={{
            borderColor: accent,
            transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))`,
          }}
        />
        <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-bold tracking-wider text-white/50">
          {label}
        </span>
      </div>
      <span className="text-[10px] text-white/45">{hint}</span>
    </div>
  );
}

export function TouchSticks({
  onMove,
  onAim,
  onAimHeld,
}: {
  onMove: (vec: StickVec | null) => void;
  onAim: (vec: StickVec | null) => void;
  onAimHeld: (held: boolean) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto">
        <ThumbStick
          label="MOVE"
          hint="왼손 · 이동"
          accent="#e2e8f0"
          onChange={onMove}
        />
      </div>
      <div className="pointer-events-auto">
        <ThumbStick
          label="FIRE"
          hint="오른손 · 조준 · 누르면 발사"
          accent="#3df0ff"
          onChange={onAim}
          onHeld={onAimHeld}
        />
      </div>
    </div>
  );
}
