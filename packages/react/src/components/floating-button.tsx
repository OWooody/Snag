import { useCallback, useEffect, useRef, useState } from "react";

import type { SnagTheme } from "../theme";

const BUTTON_SIZE = 52;
const EDGE = 12;
const BOTTOM_INSET = 80;
const TAP_SLOP = 10;

interface FloatingButtonProps {
  environmentLabel?: string;
  theme: SnagTheme;
  onPress: () => void;
}

export function FloatingButton({
  environmentLabel,
  theme,
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

  const a11yLabel = environmentLabel
    ? `Snag (${environmentLabel}): request a change on this screen`
    : "Snag: request a change on this screen";

  return (
    <button
      type="button"
      aria-label={a11yLabel}
      title={a11yLabel}
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
          d="M12 3L13.09 8.26L18 7L14.74 11.09L20 12L14.74 12.91L18 17L13.09 15.74L12 21L10.91 15.74L6 17L9.26 12.91L4 12L9.26 11.09L6 7L10.91 8.26L12 3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
