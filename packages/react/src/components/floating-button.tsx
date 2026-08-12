import { useCallback, useEffect, useRef, useState } from "react";

import type { SnagTheme } from "../theme";

const BUTTON_SIZE = 52;
const EDGE = 12;
const BOTTOM_INSET = 80;
const TAP_SLOP = 10;

interface FloatingButtonProps {
  environmentLabel?: string;
  theme: SnagTheme;
  badgeCount?: number;
  onPress: () => void;
}

export function FloatingButton({
  environmentLabel,
  theme,
  badgeCount = 0,
  onPress,
}: FloatingButtonProps) {
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth - BUTTON_SIZE - EDGE,
    y: window.innerHeight - BUTTON_SIZE - BOTTOM_INSET,
  }));
  const pointerStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef(position);
  const moved = useRef(false);

  const clampPosition = useCallback((x: number, y: number) => {
    return {
      x: Math.min(Math.max(x, EDGE), window.innerWidth - BUTTON_SIZE - EDGE),
      y: Math.min(Math.max(y, EDGE), window.innerHeight - BUTTON_SIZE - EDGE),
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => clampPosition(current.x, current.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPosition]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { x: event.clientX, y: event.clientY };
    positionStart.current = position;
    moved.current = false;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) {
      moved.current = true;
    }
    setPosition(
      clampPosition(positionStart.current.x + dx, positionStart.current.y + dy),
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved.current) onPress();
  };

  const badgeLabel = badgeCount > 9 ? "9+" : String(badgeCount);
  const a11yLabel = environmentLabel
    ? `Snag (${environmentLabel}): request a change on this screen`
    : "Snag: request a change on this screen";
  const fullLabel =
    badgeCount > 0
      ? `${a11yLabel}. ${badgeCount} awaiting your reply`
      : a11yLabel;

  return (
    <button
      type="button"
      aria-label={fullLabel}
      title={fullLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: BUTTON_SIZE,
        height: BUTTON_SIZE,
        borderRadius: BUTTON_SIZE / 2,
        border: "1px solid rgba(255,255,255,0.65)",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        cursor: moved.current ? "grabbing" : "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.text,
        zIndex: 2147483646,
        padding: 0,
        touchAction: "none",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {badgeCount > 0 ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: theme.danger,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            lineHeight: "18px",
            textAlign: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
}
