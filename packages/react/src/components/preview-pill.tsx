import { useEffect, useState } from "react";

import { applyPreview, type PreviewOp } from "../dom-preview";
import { GLASS_BLUR_SATURATE, GLASS_FILL } from "../sheet";
import type { SnagTheme } from "../theme";

/**
 * Shown instead of the sheet while a plan preview is on the page, so the
 * page stays visible. The edits are reverted when this unmounts.
 */
export function PreviewPill({
  ops,
  theme,
  onClose,
}: {
  ops: PreviewOp[];
  theme: SnagTheme;
  onClose: () => void;
}) {
  const [counts, setCounts] = useState<{ applied: number; skipped: number } | null>(null);

  useEffect(() => {
    const session = applyPreview(ops);
    setCounts({ applied: session.applied, skipped: session.skipped });
    return session.revert;
  }, [ops]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const nothingMatched = counts != null && counts.applied === 0;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "max-content",
        maxWidth: "calc(100% - 24px)",
        boxSizing: "border-box",
        padding: "10px 10px 10px 16px",
        borderRadius: 999,
        background: GLASS_FILL,
        backdropFilter: GLASS_BLUR_SATURATE,
        WebkitBackdropFilter: GLASS_BLUR_SATURATE,
        border: "1px solid rgba(255,255,255,0.55)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Approximate preview</div>
        <div style={{ fontSize: 11, color: theme.textMuted }}>
          {nothingMatched
            ? "Couldn't find these elements on this screen."
            : counts && counts.skipped > 0
              ? `Some parts of the plan aren't on this screen. The real change may look a little different.`
              : "The real change may look a little different."}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="snag-focus"
        style={{
          flexShrink: 0,
          padding: "8px 14px",
          borderRadius: 999,
          border: "none",
          background: theme.accent,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Back to plan
      </button>
    </div>
  );
}
