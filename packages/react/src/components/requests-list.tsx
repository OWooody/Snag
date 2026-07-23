import { useCallback, useEffect, useState } from "react";

import { fetchRelayState } from "../api";
import type { SnagRequestRow, SnagRequestStatus } from "../protocol";
import { GLASS_SURFACE } from "../sheet";
import type { SnagTheme } from "../theme";

interface RequestsListProps {
  theme: SnagTheme;
}

export function RequestsList({ theme }: RequestsListProps) {
  const [rows, setRows] = useState<SnagRequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const state = await fetchRelayState();
    setRows(state.requests ?? []);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          style={{
            border: "none",
            background: "transparent",
            color: theme.accent,
            fontWeight: 700,
            cursor: refreshing ? "wait" : "pointer",
            fontSize: 13,
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {rows.length === 0 ? (
        <p style={{ textAlign: "center", color: theme.textMuted, fontSize: 14, marginTop: 32 }}>
          No requests yet. Tap the button on any screen to file one.
        </p>
      ) : (
        rows.map((row) => <RequestCard key={row.id} row={row} theme={theme} />)
      )}
    </div>
  );
}

function RequestCard({ row, theme }: { row: SnagRequestRow; theme: SnagTheme }) {
  const link = row.pr_url ?? row.agent_url;
  return (
    <div
      style={{
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        background: GLASS_SURFACE,
        border: "1px solid rgba(255,255,255,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: statusColor(row.status, theme),
          }}
        >
          {row.status.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: 0 }}>
        {row.prompt}
      </p>
      {row.summary ? (
        <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 6, marginBottom: 0 }}>
          {row.summary}
        </p>
      ) : null}
      {row.error ? (
        <p style={{ fontSize: 12, color: theme.danger, marginTop: 6, marginBottom: 0 }}>
          {row.error}
        </p>
      ) : null}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            fontSize: 13,
            fontWeight: 700,
            color: theme.accent,
            marginTop: 8,
            textDecoration: "none",
          }}
        >
          {row.pr_url ? "Open pull request" : "Open agent"}
        </a>
      ) : null}
      {row.branch_name ? (
        <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, marginBottom: 0 }}>
          {row.branch_name}
        </p>
      ) : null}
    </div>
  );
}

function statusColor(status: SnagRequestStatus, theme: SnagTheme): string {
  switch (status) {
    case "finished":
      return theme.success;
    case "error":
      return theme.danger;
    default:
      return theme.accent;
  }
}
