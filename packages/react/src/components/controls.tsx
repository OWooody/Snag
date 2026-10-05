import { useEffect, useRef, useState, type ReactNode } from "react";

import { GLASS_SURFACE, SNAG_EASE, usePrefersReducedMotion } from "../sheet";
import { withAlpha } from "../styles";
import type { SnagTheme } from "../theme";

/** Toggleable filter pill; replaces a bare checkbox in toolbars. */
export function FilterChip({
  label,
  active,
  theme,
  onChange,
}: {
  label: string;
  active: boolean;
  theme: SnagTheme;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className="snag-focus"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: active ? 5 : 0,
        height: 28,
        padding: "0 11px",
        borderRadius: 999,
        border: `1px solid ${active ? withAlpha(theme.accent, 0.35) : "rgba(15,15,25,0.08)"}`,
        background: active ? withAlpha(theme.accent, 0.12) : GLASS_SURFACE,
        color: active ? theme.accent : theme.text,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        userSelect: "none",
        transition: `background 200ms ${SNAG_EASE}, border-color 200ms ${SNAG_EASE}, color 200ms ${SNAG_EASE}, gap 220ms ${SNAG_EASE}`,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          width: active ? 12 : 0,
          overflow: "hidden",
          transition: `width 220ms ${SNAG_EASE}`,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label}
    </button>
  );
}

const REFRESH_DONE_MS = 1100;

/**
 * Round refresh button. Spins while `onRefresh` runs, stops only at the end of
 * a full turn so it never snaps back, then briefly shows a check.
 */
export function RefreshButton({
  theme,
  onRefresh,
}: {
  theme: SnagTheme;
  onRefresh: () => Promise<void>;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<"idle" | "spinning" | "done">("idle");
  const settled = useRef(false);
  const doneTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  const finish = () => {
    setState("done");
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => setState("idle"), REFRESH_DONE_MS);
  };

  const refresh = async () => {
    if (state === "spinning") return;
    settled.current = false;
    window.clearTimeout(doneTimer.current);
    setState("spinning");
    try {
      await onRefresh();
    } finally {
      settled.current = true;
      // Without animation there is no iteration event to wait for.
      if (reducedMotion) finish();
    }
  };

  const done = state === "done";
  const layer = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: `opacity 220ms ${SNAG_EASE}, transform 320ms ${SNAG_EASE}`,
  } as const;

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      aria-label="Refresh requests"
      aria-busy={state === "spinning"}
      title="Refresh"
      data-state={state}
      className="snag-focus snag-refresh"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: 999,
        border: "1px solid rgba(15,15,25,0.08)",
        background: GLASS_SURFACE,
        cursor: state === "spinning" ? "progress" : "pointer",
        transition: `background 200ms ${SNAG_EASE}, color 200ms ${SNAG_EASE}, transform 160ms ${SNAG_EASE}`,
      }}
    >
      <span aria-hidden style={{ position: "relative", width: 14, height: 14 }}>
        <span
          className="snag-refresh-turn"
          style={{
            ...layer,
            opacity: done ? 0 : 1,
            transform: done ? "scale(0.6)" : undefined,
          }}
        >
          <svg
            className="snag-refresh-arrow"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: "block" }}
            onAnimationIteration={() => {
              if (settled.current) finish();
            }}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </span>
        <span
          style={{
            ...layer,
            color: theme.success,
            opacity: done ? 1 : 0,
            transform: done ? "scale(1)" : "scale(0.6)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
      <span role="status" className="snag-visually-hidden">
        {done ? "Requests updated" : ""}
      </span>
    </button>
  );
}

/** On/off switch backed by a native checkbox for keyboard and screen readers. */
export function Switch({
  checked,
  disabled = false,
  theme,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  theme: SnagTheme;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: theme.text,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="snag-visually-hidden snag-switch-input"
      />
      <span
        aria-hidden
        className="snag-switch-track"
        style={{
          position: "relative",
          flexShrink: 0,
          width: 34,
          height: 20,
          borderRadius: 999,
          background: checked ? theme.accent : "rgba(15,15,25,0.16)",
          transition: `background 200ms ${SNAG_EASE}`,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
            transform: checked ? "translateX(14px)" : "translateX(0)",
            transition: `transform 260ms ${SNAG_EASE}`,
          }}
        />
      </span>
      {children}
    </label>
  );
}
