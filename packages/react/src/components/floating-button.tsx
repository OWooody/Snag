import { useState } from "react";

import {
  GLASS_BLUR_SATURATE,
  GLASS_FILL,
  SNAG_EASE,
  TAB_PEEK_SHAPE,
  TAB_PEEK_SHAPE_WITH_BADGE,
  TAB_REST_SHAPE,
  tabPath,
  tabShapeWidth,
  usePrefersReducedMotion,
  useSpring,
  type TabShape,
} from "../sheet";
import type { SnagTheme } from "../theme";

export const TAB_LABEL = "What's on your mind?";
const STROKE = "rgba(15, 15, 25, 0.10)";
const TRACK = "rgba(15, 15, 25, 0.18)";
const HIT_MIN_HEIGHT = 28;
const LINE_WIDTH = 30;
const MORPH_MS = 460;

interface FloatingButtonProps {
  environmentLabel?: string;
  theme: SnagTheme;
  badgeCount?: number;
  running?: boolean;
  /** Opening is in progress (screenshot capture); show the working sweep. */
  busy?: boolean;
  /** Receives the shape the tab had when pressed, so the panel can grow from it. */
  onPress: (shape: TabShape) => void;
}

export function FloatingButton({
  environmentLabel,
  theme,
  badgeCount = 0,
  running = false,
  busy = false,
  onPress,
}: FloatingButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const peeking = hovered || focusVisible;
  const hasBadge = badgeCount > 0;
  const showSweep = (running || busy) && !hasBadge;
  const target = !peeking
    ? TAB_REST_SHAPE
    : hasBadge
      ? TAB_PEEK_SHAPE_WITH_BADGE
      : TAB_PEEK_SHAPE;

  const shape: TabShape = {
    w: useSpring(target.w, reducedMotion),
    h: Math.max(4, useSpring(target.h, reducedMotion)),
    f: useSpring(target.f, reducedMotion),
    r: useSpring(target.r, reducedMotion),
  };
  const totalWidth = tabShapeWidth(shape);
  const drawn = { ...shape, h: shape.h + 1 };

  const badgeLabel = badgeCount > 9 ? "9+" : String(badgeCount);
  const baseLabel = environmentLabel
    ? `Snag (${environmentLabel}): request a change on this screen`
    : "Snag: request a change on this screen";
  const fullLabel = hasBadge
    ? `${baseLabel}. ${badgeCount} awaiting your reply`
    : running
      ? `${baseLabel}. A request is in progress`
      : baseLabel;

  return (
    <button
      type="button"
      data-snag-tab="true"
      aria-label={fullLabel}
      aria-busy={busy || undefined}
      onClick={() => {
        if (!busy) onPress(target);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => setFocusVisible(matchesFocusVisible(event.currentTarget))}
      onBlur={() => setFocusVisible(false)}
      style={{
        position: "fixed",
        left: "50%",
        bottom: 0,
        width: totalWidth,
        height: Math.max(shape.h, HIT_MIN_HEIGHT),
        transform: "translateX(-50%)",
        margin: 0,
        padding: 0,
        border: "none",
        background: "transparent",
        outline: "none",
        cursor: busy ? "progress" : "pointer",
        zIndex: 2147483646,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          bottom: -1,
          width: totalWidth,
          height: drawn.h,
          clipPath: `path('${tabPath(drawn, true)}')`,
          background: GLASS_FILL,
          backdropFilter: GLASS_BLUR_SATURATE,
          WebkitBackdropFilter: GLASS_BLUR_SATURATE,
        }}
      />
      <svg
        aria-hidden
        width={totalWidth}
        height={drawn.h}
        viewBox={`0 0 ${totalWidth} ${drawn.h}`}
        style={{
          position: "absolute",
          left: 0,
          bottom: -1,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <path
          d={tabPath(drawn, false)}
          fill="none"
          stroke={focusVisible ? theme.accent : STROKE}
          strokeWidth={focusVisible ? 1.5 : 1}
        />
      </svg>

      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.min(shape.h, TAB_PEEK_SHAPE.h) / 2,
          transform: "translateY(50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflow: "hidden",
            whiteSpace: "nowrap",
            maxWidth: peeking ? 200 : 0,
            marginRight: peeking && (hasBadge || busy) ? 10 : 0,
            opacity: peeking ? 1 : 0,
            color: theme.text,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            transition: `max-width ${MORPH_MS}ms ${SNAG_EASE}, margin ${MORPH_MS}ms ${SNAG_EASE}, opacity 260ms ${SNAG_EASE} ${peeking ? 90 : 0}ms`,
          }}
        >
          <ChatIcon />
          {TAB_LABEL}
        </span>
        <span
          className={hasBadge && !peeking ? "snag-tab-glow" : undefined}
          style={{
            position: "relative",
            overflow: hasBadge ? "visible" : "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: peeking ? (hasBadge ? 22 : busy ? LINE_WIDTH : 0) : LINE_WIDTH,
            height: peeking && hasBadge ? 18 : 3,
            borderRadius: 999,
            background: hasBadge ? theme.danger : TRACK,
            opacity: peeking && !hasBadge && !busy ? 0 : 1,
            transition: `width ${MORPH_MS}ms ${SNAG_EASE}, height ${MORPH_MS}ms ${SNAG_EASE}, background 300ms ${SNAG_EASE}, opacity 220ms ${SNAG_EASE}`,
          }}
        >
          {hasBadge ? (
            <span
              style={{
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                opacity: peeking ? 1 : 0,
                transform: peeking ? "scale(1)" : "scale(0.5)",
                transition: `opacity 220ms ${SNAG_EASE} ${peeking ? 160 : 0}ms, transform 360ms ${SNAG_EASE} ${peeking ? 120 : 0}ms`,
              }}
            >
              {badgeLabel}
            </span>
          ) : showSweep ? (
            <span
              className="snag-tab-sweep"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 12,
                height: "100%",
                borderRadius: 999,
                background: theme.accent,
              }}
            />
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function ChatIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function matchesFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}
