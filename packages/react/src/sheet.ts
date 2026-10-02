import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/** Frosted glass fill for bottom sheets — translucent, not solid white. */
export const GLASS_FILL = "rgba(255, 255, 255, 0.72)";

/** Inner controls / wells on glass sheets. */
export const GLASS_SURFACE = "rgba(255, 255, 255, 0.48)";

const GLASS_BLUR = "blur(20px)";
const GLASS_BORDER = "1px solid rgba(255, 255, 255, 0.55)";

/** Sheet slide duration — keep in sync with `glassSheetStyle` transition. */
export const SHEET_MOTION_MS = 360;

/** Tab body height / fade duration when switching New ↔ Requests. */
export const TAB_MOTION_MS = 280;

/**
 * Present a bottom sheet with expand (slide up) / de-expand (slide down) motion.
 * Call `requestClose` instead of unmounting; `onExited` fires after the exit
 * animation finishes so the parent can remove the dialog from the tree.
 */
export function useSheetMotion(onExited: () => void): {
  open: boolean;
  requestClose: () => void;
} {
  const [open, setOpen] = useState(false);
  const hasOpened = useRef(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    // Double rAF so the closed (off-screen) frame paints before expand.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        hasOpened.current = true;
        setOpen(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const requestClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (open || !hasOpened.current) return;
    const timer = window.setTimeout(() => {
      onExitedRef.current();
    }, SHEET_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return { open, requestClose };
}

/** Blur for glass surfaces that morph between the tab and the panel. */
export const GLASS_BLUR_SATURATE = "blur(20px) saturate(180%)";

export const SNAG_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Outline of the bottom tab and of the panel it grows into. `w` is the flat
 * top width, `h` the height, `f` the flare where each side curves into the
 * bottom edge, `r` the top corner radius.
 */
export interface TabShape {
  w: number;
  h: number;
  f: number;
  r: number;
}

export const TAB_REST_SHAPE: TabShape = { w: 108, h: 12, f: 12, r: 12 };
export const TAB_PEEK_SHAPE: TabShape = { w: 180, h: 40, f: 14, r: 16 };
export const TAB_PEEK_SHAPE_WITH_BADGE: TabShape = { ...TAB_PEEK_SHAPE, w: 210 };
export const TAB_PEEK_SHAPE_WITH_DONE: TabShape = { ...TAB_PEEK_SHAPE, w: 222 };
export const TAB_PEEK_SHAPE_WITH_BOTH: TabShape = { ...TAB_PEEK_SHAPE, w: 262 };

export function tabShapeWidth(shape: TabShape): number {
  return shape.w + 2 * (shape.f + shape.r);
}

export function lerpShape(from: TabShape, to: TabShape, t: number): TabShape {
  return {
    w: from.w + (to.w - from.w) * t,
    h: from.h + (to.h - from.h) * t,
    f: from.f + (to.f - from.f) * t,
    r: from.r + (to.r - from.r) * t,
  };
}

/**
 * SVG path for a tab shape whose bottom-left corner sits at (x, y + h). Both
 * curves on each side shrink proportionally when `h` is too short for them,
 * so the resting sliver reads as one smooth hill rather than a clipped box.
 */
export function tabPath(shape: TabShape, closed: boolean, x = 0, y = 0): string {
  const { w, h, f, r } = shape;
  const scale = Math.min(1, h / Math.max(f + r, 0.001));
  const fy = f * scale;
  const ry = r * scale;
  const total = tabShapeWidth(shape);
  const right = x + total - f;
  const left = x + f;
  const bottom = y + h;
  const k = 0.55;
  const d = [
    `M${x} ${bottom}`,
    `C${x + f * k} ${bottom} ${left} ${bottom - fy * (1 - k)} ${left} ${bottom - fy}`,
    `L${left} ${y + ry}`,
    `C${left} ${y + ry * (1 - k)} ${left + r * (1 - k)} ${y} ${left + r} ${y}`,
    `L${right - r} ${y}`,
    `C${right - r * (1 - k)} ${y} ${right} ${y + ry * (1 - k)} ${right} ${y + ry}`,
    `L${right} ${bottom - fy}`,
    `C${right} ${bottom - fy * (1 - k)} ${x + total - f * k} ${bottom} ${x + total} ${bottom}`,
  ].join(" ");
  return closed ? `${d} Z` : d;
}

interface SpringOptions {
  stiffness?: number;
  damping?: number;
  /** Settle once both distance and velocity drop below this. */
  precision?: number;
}

/** Animates toward `target` with a light spring; jumps when `immediate`. */
export function useSpring(
  target: number,
  immediate: boolean,
  { stiffness = 0.12, damping = 0.76, precision = 0.05 }: SpringOptions = {},
): number {
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
      s.velocity = (s.velocity + (target - s.position) * stiffness) * damping;
      s.position += s.velocity;
      if (
        Math.abs(target - s.position) < precision &&
        Math.abs(s.velocity) < precision
      ) {
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
  }, [target, immediate, stiffness, damping, precision]);

  return value;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
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

/**
 * Like `useSheetMotion`, but exposes a spring `progress` (0 = tab, 1 = panel)
 * so the panel can grow out of the bottom tab and shrink back into it.
 * `onExited` fires once the closing spring has fully settled.
 */
export function useMorphMotion(onExited: () => void): {
  open: boolean;
  progress: number;
  requestClose: () => void;
} {
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const hasOpened = useRef(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        hasOpened.current = true;
        setOpen(true);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const progress = useSpring(open ? 1 : 0, reducedMotion, {
    stiffness: 0.09,
    damping: 0.74,
    precision: 0.002,
  });

  useEffect(() => {
    if (!open && hasOpened.current && progress === 0) onExitedRef.current();
  }, [open, progress]);

  const requestClose = useCallback(() => setOpen(false), []);

  return { open, progress, requestClose };
}

export function glassBackdropStyle(
  open: boolean,
  dim = "rgba(0,0,0,0.35)",
): CSSProperties {
  return {
    background: open ? dim : "rgba(0,0,0,0)",
    transition: `background ${SHEET_MOTION_MS}ms ease-out`,
  };
}

export function glassSheetStyle(open: boolean): CSSProperties {
  return {
    background: GLASS_FILL,
    backdropFilter: GLASS_BLUR,
    WebkitBackdropFilter: GLASS_BLUR,
    borderTop: GLASS_BORDER,
    borderLeft: GLASS_BORDER,
    borderRight: GLASS_BORDER,
    boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
    // Full-height slide: expands up from below the viewport, collapses back down.
    transform: open ? "translateY(0)" : "translateY(100%)",
    transition: `transform ${SHEET_MOTION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
    willChange: "transform",
  };
}
