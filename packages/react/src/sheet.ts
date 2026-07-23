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
