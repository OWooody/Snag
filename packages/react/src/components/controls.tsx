import type { ReactNode } from "react";

import { GLASS_SURFACE, SNAG_EASE } from "../sheet";
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
