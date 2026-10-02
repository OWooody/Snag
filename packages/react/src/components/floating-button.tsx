import { useEffect, useRef, useState } from "react";

import { GLASS_FILL } from "../sheet";
import type { SnagTheme } from "../theme";

const LABEL = "What's on your mind?";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const STROKE = "rgba(15, 15, 25, 0.10)";
const TRACK = "rgba(15, 15, 25, 0.18)";
const GLASS_BLUR = "blur(20px) saturate(180%)";
const HIT_MIN_HEIGHT = 28;
const LINE_WIDTH = 30;
const MORPH_MS = 460;

// w = flat top width, h = height, f = flare where each side meets the bottom
// edge, r = top corner radius.
const REST_SHAPE = { w: 108, h: 12, f: 12, r: 12 };
const PEEK_SHAPE = { w: 180, h: 40, f: 14, r: 16 };
const PEEK_SHAPE_WITH_BADGE = { ...PEEK_SHAPE, w: 210 };

interface FloatingButtonProps {
  environmentLabel?: string;
  theme: SnagTheme;
  badgeCount?: number;
  running?: boolean;
  onPress: () => void;
}

export function FloatingButton({
  environmentLabel,
  theme,
  badgeCount = 0,
  running = false,
  onPress,
}: FloatingButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const peeking = hovered || focusVisible;
  const hasBadge = badgeCount > 0;
  const target = !peeking ? REST_SHAPE : hasBadge ? PEEK_SHAPE_WITH_BADGE : PEEK_SHAPE;

  const w = useSpring(target.w, reducedMotion);
  const h = Math.max(4, useSpring(target.h, reducedMotion));
  const f = useSpring(target.f, reducedMotion);
  const r = useSpring(target.r, reducedMotion);
  const totalWidth = w + 2 * (f + r);
  const shapeHeight = h + 1;

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
    <>
      <style>{keyframes(theme.danger)}</style>
      <button
        type="button"
        data-snag-tab="true"
        aria-label={fullLabel}
        onClick={onPress}
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
          height: Math.max(h, HIT_MIN_HEIGHT),
          transform: "translateX(-50%)",
          margin: 0,
          padding: 0,
          border: "none",
          background: "transparent",
          outline: "none",
          cursor: "pointer",
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
            height: shapeHeight,
            clipPath: `path('${tabPath(w, shapeHeight, f, r, true)}')`,
            background: GLASS_FILL,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
          }}
        />
        <svg
          aria-hidden
          width={totalWidth}
          height={shapeHeight}
          viewBox={`0 0 ${totalWidth} ${shapeHeight}`}
          style={{
            position: "absolute",
            left: 0,
            bottom: -1,
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          <path
            d={tabPath(w, shapeHeight, f, r, false)}
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
            bottom: Math.min(h, PEEK_SHAPE.h) / 2,
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
              marginRight: peeking && hasBadge ? 10 : 0,
              opacity: peeking ? 1 : 0,
              color: theme.text,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              transition: `max-width ${MORPH_MS}ms ${EASE}, margin ${MORPH_MS}ms ${EASE}, opacity 260ms ${EASE} ${peeking ? 90 : 0}ms`,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {LABEL}
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
              width: peeking ? (hasBadge ? 22 : 0) : LINE_WIDTH,
              height: peeking && hasBadge ? 18 : 3,
              borderRadius: 999,
              background: hasBadge ? theme.danger : TRACK,
              opacity: peeking && !hasBadge ? 0 : 1,
              transition: `width ${MORPH_MS}ms ${EASE}, height ${MORPH_MS}ms ${EASE}, background 300ms ${EASE}, opacity 220ms ${EASE}`,
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
                  transition: `opacity 220ms ${EASE} ${peeking ? 160 : 0}ms, transform 360ms ${EASE} ${peeking ? 120 : 0}ms`,
                }}
              >
                {badgeLabel}
              </span>
            ) : running ? (
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
    </>
  );
}

// Both curves on each side shrink proportionally when h is too short for them,
// so the rest state reads as one smooth hill rather than a clipped rectangle.
function tabPath(w: number, h: number, f: number, r: number, closed: boolean): string {
  const scale = Math.min(1, h / (f + r));
  const fy = f * scale;
  const ry = r * scale;
  const total = w + 2 * (f + r);
  const right = total - f;
  const k = 0.55;
  const d = [
    `M0 ${h}`,
    `C${f * k} ${h} ${f} ${h - fy * (1 - k)} ${f} ${h - fy}`,
    `L${f} ${ry}`,
    `C${f} ${ry * (1 - k)} ${f + r * (1 - k)} 0 ${f + r} 0`,
    `L${right - r} 0`,
    `C${right - r * (1 - k)} 0 ${right} ${ry * (1 - k)} ${right} ${ry}`,
    `L${right} ${h - fy}`,
    `C${right} ${h - fy * (1 - k)} ${total - f * k} ${h} ${total} ${h}`,
  ].join(" ");
  return closed ? `${d} Z` : d;
}

function useSpring(target: number, immediate: boolean): number {
  const [value, setValue] = useState(target);
  const state = useRef({ position: target, velocity: 0 });

  useEffect(() => {
    if (immediate) {
      state.current = { position: target, velocity: 0 };
      setValue(target);
      return;
    }
    let frame = 0;
    const tick = () => {
      const s = state.current;
      s.velocity = (s.velocity + (target - s.position) * 0.12) * 0.76;
      s.position += s.velocity;
      if (Math.abs(target - s.position) < 0.05 && Math.abs(s.velocity) < 0.05) {
        s.position = target;
        s.velocity = 0;
        setValue(target);
        return;
      }
      setValue(s.position);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, immediate]);

  return value;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function matchesFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const digits =
    match[1].length === 3
      ? match[1].split("").map((c) => c + c).join("")
      : match[1];
  const n = parseInt(digits, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function keyframes(danger: string): string {
  return `
[data-snag-tab] .snag-tab-glow { animation: snag-tab-glow 2.2s ease-in-out infinite; }
[data-snag-tab] .snag-tab-sweep { animation: snag-tab-sweep 2.6s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes snag-tab-glow {
  0%, 100% { box-shadow: 0 0 3px 0 ${withAlpha(danger, 0.4)}; }
  50% { box-shadow: 0 0 8px 1px ${withAlpha(danger, 0.7)}, 0 0 16px 3px ${withAlpha(danger, 0.22)}; }
}
@keyframes snag-tab-sweep {
  0% { transform: translateX(-14px); }
  100% { transform: translateX(${LINE_WIDTH + 2}px); }
}
@media (prefers-reduced-motion: reduce) {
  [data-snag-tab] * { animation: none !important; transition: none !important; }
}
`;
}
