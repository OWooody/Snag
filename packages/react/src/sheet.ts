import { useEffect, useState, type CSSProperties } from "react";

/** Frosted glass fill for bottom sheets — translucent, not solid white. */
export const GLASS_FILL = "rgba(255, 255, 255, 0.72)";

/** Inner controls / wells on glass sheets. */
export const GLASS_SURFACE = "rgba(255, 255, 255, 0.48)";

const GLASS_BLUR = "blur(20px)";
const GLASS_BORDER = "1px solid rgba(255, 255, 255, 0.55)";

export function useSheetEnter(): boolean {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return entered;
}

export function glassBackdropStyle(
  entered: boolean,
  dim = "rgba(0,0,0,0.35)",
): CSSProperties {
  return {
    background: entered ? dim : "rgba(0,0,0,0)",
    transition: "background 220ms ease-out",
  };
}

export function glassSheetStyle(entered: boolean): CSSProperties {
  return {
    background: GLASS_FILL,
    backdropFilter: GLASS_BLUR,
    WebkitBackdropFilter: GLASS_BLUR,
    borderTop: GLASS_BORDER,
    borderLeft: GLASS_BORDER,
    borderRight: GLASS_BORDER,
    boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
    transform: entered ? "translateY(0)" : "translateY(32px)",
    opacity: entered ? 1 : 0,
    transition:
      "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
  };
}
