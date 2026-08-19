import { useCallback, useEffect, useRef, useState } from "react";
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
  const pointerIdRef = useRef<number | null>(null);
  const touchIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const onHeldRef = useRef(onHeld);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  onChangeRef.current = onChange;
  onHeldRef.current = onHeld;

  const applyInput = useCallback((clientX: number, clientY: number) => {
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
    const rawX = clientX - (box.left + box.width / 2);
    const rawY = clientY - (box.top + box.height / 2);
    const maxOffset = box.width * 0.32;
    const rawLength = Math.hypot(rawX, rawY);
    const clamp = rawLength > maxOffset ? maxOffset / rawLength : 1;
    setKnob({ x: rawX * clamp, y: rawY * clamp });
    onChangeRef.current(vec);
  }, []);

  const release = useCallback(() => {
    heldRef.current = false;
    pointerIdRef.current = null;
    touchIdRef.current = null;
    setHeld(false);
    setKnob({ x: 0, y: 0 });
    onChangeRef.current(null);
    onHeldRef.current?.(false);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (
        heldRef.current &&
        pointerIdRef.current !== null &&
        event.pointerId === pointerIdRef.current
      ) {
        applyInput(event.clientX, event.clientY);
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (
        event.pointerId === pointerIdRef.current &&
        touchIdRef.current === null
      ) {
        release();
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      // iOS can emit a ghost pointercancel while the matching touch remains.
      if (
        event.pointerId === pointerIdRef.current &&
        touchIdRef.current === null
      ) {
        release();
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!heldRef.current) return;
      const touch = [...event.touches].find(
        (candidate) => candidate.identifier === touchIdRef.current,
      );
      if (!touch) return;
      event.preventDefault();
      applyInput(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (
        [...event.changedTouches].some(
          (touch) => touch.identifier === touchIdRef.current,
        )
      ) {
        release();
      }
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: false });
    window.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyInput, release]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={padRef}
        className="relative h-28 w-28 touch-none rounded-full border border-white/25 bg-black/45 shadow-[0_0_24px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        style={{ boxShadow: held ? `0 0 22px ${accent}` : undefined }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          pointerIdRef.current = e.pointerId;
          heldRef.current = true;
          setHeld(true);
          onHeldRef.current?.(true);
          applyInput(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          const touch = e.changedTouches[0];
          if (!touch) return;
          e.preventDefault();
          e.stopPropagation();
          touchIdRef.current = touch.identifier;
          heldRef.current = true;
          setHeld(true);
          onHeldRef.current?.(true);
          applyInput(touch.clientX, touch.clientY);
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 rounded-full border-2 bg-white/80"
          style={{
            borderColor: accent,
            transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
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
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between px-4 pb-[max(2.25rem,env(safe-area-inset-bottom)+2.25rem)]">
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
