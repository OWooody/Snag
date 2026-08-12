import { useCallback, useEffect, useState } from "react";

import { fetchRelayState, replyToSnagRequest } from "../api";
import { resolveRequester } from "../config";
import type { SnagRequestRow, SnagRequestStatus } from "../protocol";
import { displaySummaryForRequest } from "../requester-questions";
import { LightMarkdown } from "../light-markdown";
import { GLASS_SURFACE } from "../sheet";
import type { SnagTheme } from "../theme";

const POLL_INTERVAL_MS = 20_000;
const MAX_REPLY_LENGTH = 2000;

interface RequestsListProps {
  theme: SnagTheme;
  /** Bump to force an immediate reload (e.g. after submit). */
  refreshKey?: number;
  followupsEnabled?: boolean;
}

export function RequestsList({
  theme,
  refreshKey = 0,
  followupsEnabled = false,
}: RequestsListProps) {
  const [rows, setRows] = useState<SnagRequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentRequester, setCurrentRequester] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(true);
  // Default on: show needs_input first; user can uncheck to see all.
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [state, requester] = await Promise.all([
      fetchRelayState(),
      resolveRequester(),
    ]);
    setRows(state.requests ?? []);
    setCurrentRequester(requester);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void load();
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const visibleRows = rows.filter((row) => {
    if (
      followupsEnabled &&
      needsAttentionOnly &&
      row.status !== "needs_input"
    ) {
      return false;
    }
    if (mineOnly && currentRequester && row.requester !== currentRequester) {
      return false;
    }
    return true;
  });

  const emptyMessage = () => {
    if (followupsEnabled && needsAttentionOnly && mineOnly) {
      return "Nothing needs your reply right now.";
    }
    if (followupsEnabled && needsAttentionOnly) {
      return "Nothing needs a reply right now. Uncheck Needs reply to see all.";
    }
    if (mineOnly) return "No requests from you yet.";
    return "No requests yet. Tap the button on any screen to file one.";
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {followupsEnabled ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: theme.text,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={needsAttentionOnly}
              onChange={(event) => setNeedsAttentionOnly(event.target.checked)}
            />
            Needs reply
          </label>
        ) : null}
        {currentRequester ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: theme.text,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(event) => setMineOnly(event.target.checked)}
            />
            Mine
          </label>
        ) : null}
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
      {visibleRows.length === 0 ? (
        <p style={{ textAlign: "center", color: theme.textMuted, fontSize: 14, marginTop: 32 }}>
          {emptyMessage()}
        </p>
      ) : (
        visibleRows.map((row) => (
          <RequestCard
            key={row.id}
            row={row}
            theme={theme}
            followupsEnabled={followupsEnabled}
            onReplied={() => void load()}
          />
        ))
      )}
    </div>
  );
}

function RequestCard({
  row,
  theme,
  followupsEnabled,
  onReplied,
}: {
  row: SnagRequestRow;
  theme: SnagTheme;
  followupsEnabled: boolean;
  onReplied: () => void;
}) {
  const link = row.pr_url ?? row.agent_url;
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const canReply = followupsEnabled && row.status === "needs_input";
  const summaryText = displaySummaryForRequest(row.status, row.summary);

  const submitReply = async () => {
    const trimmed = reply.trim();
    if (!trimmed) {
      setReplyError("Write a reply first.");
      return;
    }
    setSending(true);
    setReplyError(null);
    try {
      await replyToSnagRequest(row.id, trimmed);
      setReply("");
      onReplied();
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Reply failed");
    } finally {
      setSending(false);
    }
  };

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
          {row.status === "needs_input" ? "NEEDS YOUR REPLY" : row.status.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: 0 }}>
        {row.prompt}
      </p>
      {row.requester ? (
        <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, marginBottom: 0 }}>
          {row.requester}
        </p>
      ) : null}
      {summaryText ? (
        <div style={{ marginTop: 6 }}>
          <LightMarkdown text={summaryText} color={theme.textMuted} fontSize={12} />
        </div>
      ) : null}
      {row.error ? (
        <p style={{ fontSize: 12, color: theme.danger, marginTop: 6, marginBottom: 0 }}>
          {row.error}
        </p>
      ) : null}
      {canReply ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value.slice(0, MAX_REPLY_LENGTH))}
            disabled={sending}
            placeholder="Answer the questions above…"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.55)",
              padding: 10,
              fontSize: 13,
              color: theme.text,
              resize: "vertical",
            }}
          />
          {replyError ? (
            <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>
              {replyError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void submitReply()}
            disabled={sending}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: theme.accent,
              color: "#fff",
              fontWeight: 700,
              cursor: sending ? "wait" : "pointer",
              fontSize: 13,
            }}
          >
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
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
    case "needs_input":
      return theme.accent;
    default:
      return theme.accent;
  }
}
