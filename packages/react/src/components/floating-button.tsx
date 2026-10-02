import { useState } from "react";

import {
  GLASS_BLUR_SATURATE,
  GLASS_FILL,
  SNAG_EASE,
  TAB_PEEK_SHAPE,
  TAB_PEEK_SHAPE_WITH_BADGE,
  TAB_PEEK_SHAPE_WITH_BOTH,
  TAB_PEEK_SHAPE_WITH_DONE,
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
const DONE_PILL_WIDTH = 34;
const MORPH_MS = 460;

interface FloatingButtonProps {
  environmentLabel?: string;
  theme: SnagTheme;
  badgeCount?: number;
  /** Requests that finished since the requester last opened the Requests tab. */
  doneCount?: number;
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
  doneCount = 0,
  running = false,
  busy = false,
  onPress,
}: FloatingButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const peeking = hovered || focusVisible;
  const hasBadge = badgeCount > 0;
  const hasDone = doneCount > 0;
  const showBoth = hasBadge && hasDone;
  // The line shows one state at rest: waiting on you, then done, then running.
  const pill = hasBadge
    ? { color: theme.danger, count: badgeCount, check: false, glow: "snag-tab-glow" }
    : hasDone
      ? { color: theme.success, count: doneCount, check: true, glow: "snag-tab-done-glow" }
      : null;
  const showSweep = (running || busy) && !pill;
  const target = !peeking
    ? TAB_REST_SHAPE
    : showBoth
      ? TAB_PEEK_SHAPE_WITH_BOTH
      : hasBadge
        ? TAB_PEEK_SHAPE_WITH_BADGE
        : hasDone
          ? TAB_PEEK_SHAPE_WITH_DONE
          : TAB_PEEK_SHAPE;

  const shape: TabShape = {
    w: useSpring(target.w, reducedMotion),
    h: Math.max(4, useSpring(target.h, reducedMotion)),
    f: useSpring(target.f, reducedMotion),
    r: useSpring(target.r, reducedMotion),
  };
  const totalWidth = tabShapeWidth(shape);
  const drawn = { ...shape, h: shape.h + 1 };

  const baseLabel = environmentLabel
    ? `Snag (${environmentLabel}): request a change on this screen`
    : "Snag: request a change on this screen";
  const fullLabel = [
    baseLabel,
    hasBadge ? `${badgeCount} awaiting your reply` : null,
    hasDone ? `${doneCount} ${doneCount === 1 ? "request" : "requests"} finished` : null,
    running && !hasBadge && !hasDone ? "A request is in progress" : null,
  ]
    .filter(Boolean)
    .join(". ");

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
            marginRight: peeking && (pill || busy) ? 10 : 0,
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
          className={pill && !peeking ? pill.glow : undefined}
          style={{
            position: "relative",
            overflow: pill ? "visible" : "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: peeking
              ? pill
                ? pill.check
                  ? DONE_PILL_WIDTH
                  : 22
                : busy
                  ? LINE_WIDTH
                  : 0
              : LINE_WIDTH,
            height: peeking && pill ? 18 : 3,
            borderRadius: 999,
            background: pill ? pill.color : TRACK,
            opacity: peeking && !pill && !busy ? 0 : 1,
            transition: `width ${MORPH_MS}ms ${SNAG_EASE}, height ${MORPH_MS}ms ${SNAG_EASE}, background 300ms ${SNAG_EASE}, opacity 220ms ${SNAG_EASE}`,
          }}
        >
          {pill ? (
            <span
              style={{
                ...pillTextStyle,
                opacity: peeking ? 1 : 0,
                transform: peeking ? "scale(1)" : "scale(0.5)",
                transition: `opacity 220ms ${SNAG_EASE} ${peeking ? 160 : 0}ms, transform 360ms ${SNAG_EASE} ${peeking ? 120 : 0}ms`,
              }}
            >
              {pill.check ? <CheckIcon /> : null}
              {formatCount(pill.count)}
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
        {showBoth ? (
          <span
            style={{
              ...pillTextStyle,
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              width: peeking ? DONE_PILL_WIDTH : 0,
              height: 18,
              marginLeft: peeking ? 6 : 0,
              borderRadius: 999,
              background: theme.success,
              opacity: peeking ? 1 : 0,
              transform: peeking ? "scale(1)" : "scale(0.6)",
              transition: `width ${MORPH_MS}ms ${SNAG_EASE} ${peeking ? 80 : 0}ms, margin ${MORPH_MS}ms ${SNAG_EASE} ${peeking ? 80 : 0}ms, opacity 240ms ${SNAG_EASE} ${peeking ? 200 : 0}ms, transform 380ms ${SNAG_EASE} ${peeking ? 160 : 0}ms`,
            }}
          >
            <CheckIcon />
            {formatCount(doneCount)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

const pillTextStyle = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  color: "#fff",
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
} as const;

function formatCount(count: number): string {
  return count > 9 ? "9+" : String(count);
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
