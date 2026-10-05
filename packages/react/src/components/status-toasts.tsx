import { useEffect, useRef } from "react";

import type { StatusEvent } from "../notifications";
import { GLASS_BLUR_SATURATE, GLASS_FILL } from "../sheet";
import type { SnagTheme } from "../theme";

const TOAST_MS = 8_000;

export interface Toast {
  key: string;
  event: StatusEvent;
}

/** Stacked toasts above the tab; each dismisses itself after a few seconds. */
export function StatusToasts({
  toasts,
  theme,
  onOpen,
  onDismiss,
}: {
  toasts: Toast[];
  theme: SnagTheme;
  onOpen: (toast: Toast) => void;
  onDismiss: (key: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 64,
        transform: "translateX(-50%)",
        zIndex: 2147483646,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(360px, calc(100% - 24px))",
      }}
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.key}
          toast={toast}
          theme={theme}
          onOpen={() => onOpen(toast)}
          onDismiss={() => onDismiss(toast.key)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  theme,
  onOpen,
  onDismiss,
}: {
  toast: Toast;
  theme: SnagTheme;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const id = window.setTimeout(() => dismissRef.current(), TOAST_MS);
    return () => window.clearTimeout(id);
  }, []);

  const problem = toast.event.status === "error";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 10px 10px 14px",
        borderRadius: 12,
        background: GLASS_FILL,
        backdropFilter: GLASS_BLUR_SATURATE,
        WebkitBackdropFilter: GLASS_BLUR_SATURATE,
        border: "1px solid rgba(255,255,255,0.55)",
        borderLeft: `3px solid ${problem ? theme.danger : theme.accent}`,
        boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>{toast.event.title}</div>
        <div
          style={{
            fontSize: 12,
            color: theme.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast.event.row.prompt}
        </div>
      </div>
      {toast.event.status === "merged" ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="snag-focus"
          style={{
            flexShrink: 0,
            padding: "5px 11px",
            borderRadius: 8,
            border: `1px solid ${theme.accent}`,
            background: "transparent",
            color: theme.accent,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Reload page
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="snag-focus"
        style={{
          flexShrink: 0,
          padding: "6px 12px",
          borderRadius: 8,
          border: "none",
          background: theme.accent,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        View
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="snag-focus"
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          border: "none",
          background: "transparent",
          color: theme.textMuted,
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
