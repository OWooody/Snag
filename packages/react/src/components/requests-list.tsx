import { useCallback, useEffect, useRef, useState } from "react";

import { confirmSnagRequest, fetchRelayState, replyToSnagRequest } from "../api";
import { resolveRequester } from "../config";
import type { SnagRequestRow, SnagRequestStatus } from "../protocol";
import { displaySummaryForRequest } from "../requester-questions";
import { LightMarkdown } from "../light-markdown";
import { GLASS_SURFACE } from "../sheet";
import type { SnagTheme } from "../theme";

const POLL_INTERVAL_MS = 10_000;
const MAX_REPLY_LENGTH = 2000;
const COLLAPSED_SUMMARY_MAX_HEIGHT = 64;

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
  const [agentMode, setAgentMode] = useState<"plan_only" | "execute" | null>(null);
  // null until the user toggles it: execute projects default to showing all
  // requests (progress matters there), plan-only projects to "Needs you".
  const [needsAttentionChoice, setNeedsAttentionChoice] = useState<boolean | null>(null);
  const needsAttentionOnly = needsAttentionChoice ?? agentMode !== "execute";
  // Per-card expand/collapse chosen by the user; kept across polls.
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    const [state, requester] = await Promise.all([
      fetchRelayState(),
      resolveRequester(),
    ]);
    setRows(state.requests ?? []);
    if (state.agent_mode) setAgentMode(state.agent_mode);
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
      row.status !== "needs_input" &&
      row.status !== "awaiting_confirmation"
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
      return "Nothing needs you right now.";
    }
    if (followupsEnabled && needsAttentionOnly) {
      return "Nothing needs a reply right now. Uncheck Needs you to see all.";
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
              onChange={(event) => setNeedsAttentionChoice(event.target.checked)}
            />
            Needs you
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
        visibleRows.map((row) => {
          const needsRequester =
            row.status === "awaiting_confirmation" ||
            (followupsEnabled && row.status === "needs_input");
          return (
            <RequestCard
              key={row.id}
              row={row}
              theme={theme}
              followupsEnabled={followupsEnabled}
              expanded={expandedOverrides[row.id] ?? needsRequester}
              onToggleExpanded={(next) =>
                setExpandedOverrides((current) => ({ ...current, [row.id]: next }))
              }
              onReplied={() => void load()}
            />
          );
        })
      )}
    </div>
  );
}

function RequestCard({
  row,
  theme,
  followupsEnabled,
  expanded,
  onToggleExpanded,
  onReplied,
}: {
  row: SnagRequestRow;
  theme: SnagTheme;
  followupsEnabled: boolean;
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  onReplied: () => void;
}) {
  const link = row.pr_url ?? row.agent_url;
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const canReply = followupsEnabled && row.status === "needs_input";
  const canConfirm = row.status === "awaiting_confirmation";
  const summaryText = displaySummaryForRequest(row.status, row.summary);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [summaryOverflows, setSummaryOverflows] = useState(false);

  useEffect(() => {
    const node = summaryRef.current;
    setSummaryOverflows(node != null && node.scrollHeight > COLLAPSED_SUMMARY_MAX_HEIGHT + 4);
  }, [summaryText]);

  const canToggle = summaryOverflows || canReply || canConfirm;
  const showActions = expanded || !canToggle;

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

  const confirm = async (decision: "looks_right" | "not_right") => {
    const trimmed = feedback.trim();
    if (decision === "not_right" && !trimmed) {
      setConfirmError("Tell us what is not right first.");
      return;
    }
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmSnagRequest(
        decision === "looks_right"
          ? { request_id: row.id, decision }
          : { request_id: row.id, decision, feedback: trimmed },
      );
      setFeedback("");
      setFeedbackOpen(false);
      onReplied();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setConfirming(false);
    }
  };

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.5)",
    background: "rgba(255,255,255,0.55)",
    padding: 10,
    fontSize: 13,
    color: theme.text,
    resize: "vertical" as const,
  };

  const buttonStyle = (primary: boolean, busy: boolean) => ({
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${theme.accent}`,
    background: primary ? theme.accent : "transparent",
    color: primary ? "#fff" : theme.accent,
    fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
    fontSize: 13,
  });

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
          {STATUS_LABELS[row.status] ?? row.status.toUpperCase()}
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
        <div
          ref={summaryRef}
          style={{
            marginTop: 6,
            position: "relative",
            overflow: "hidden",
            maxHeight: expanded ? undefined : COLLAPSED_SUMMARY_MAX_HEIGHT,
            ...(expanded || !summaryOverflows
              ? {}
              : {
                  maskImage: "linear-gradient(to bottom, #000 55%, transparent)",
                  WebkitMaskImage: "linear-gradient(to bottom, #000 55%, transparent)",
                }),
          }}
        >
          <LightMarkdown text={summaryText} color={theme.textMuted} fontSize={12} />
        </div>
      ) : null}
      {canToggle ? (
        <button
          type="button"
          onClick={() => onToggleExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            marginTop: 6,
            color: theme.accent,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
      {row.error ? (
        <p style={{ fontSize: 12, color: theme.danger, marginTop: 6, marginBottom: 0 }}>
          {row.error}
        </p>
      ) : null}
      {canReply && showActions ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value.slice(0, MAX_REPLY_LENGTH))}
            disabled={sending}
            placeholder="Answer the questions above…"
            rows={3}
            style={fieldStyle}
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
      {canConfirm && showActions ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, color: theme.text, margin: "0 0 8px" }}>
            Your change is ready to try. Check the preview, then tell us if it looks right —
            it goes live once you confirm.
          </p>
          {row.preview_url ? (
            <a
              href={row.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.55)",
                color: theme.accent,
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                marginBottom: 8,
              }}
            >
              Open preview
            </a>
          ) : null}
          {feedbackOpen ? (
            <>
              <textarea
                value={feedback}
                onChange={(event) =>
                  setFeedback(event.target.value.slice(0, MAX_REPLY_LENGTH))
                }
                disabled={confirming}
                placeholder="What should be different?"
                rows={3}
                style={fieldStyle}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(false)}
                  disabled={confirming}
                  style={buttonStyle(false, confirming)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirm("not_right")}
                  disabled={confirming}
                  style={buttonStyle(true, confirming)}
                >
                  {confirming ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                disabled={confirming}
                style={buttonStyle(false, confirming)}
              >
                Not right
              </button>
              <button
                type="button"
                onClick={() => void confirm("looks_right")}
                disabled={confirming}
                style={buttonStyle(true, confirming)}
              >
                {confirming ? "Confirming…" : "Looks right"}
              </button>
            </div>
          )}
          {confirmError ? (
            <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>
              {confirmError}
            </p>
          ) : null}
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

const STATUS_LABELS: Record<SnagRequestStatus, string> = {
  queued: "QUEUED",
  running: "IN PROGRESS",
  needs_input: "NEEDS YOUR REPLY",
  awaiting_approval: "WAITING FOR A DEVELOPER",
  awaiting_review: "IN DEVELOPER REVIEW",
  awaiting_confirmation: "READY FOR YOU TO CHECK",
  finished: "FINISHED",
  merged: "LIVE",
  error: "ERROR",
};

function statusColor(status: SnagRequestStatus, theme: SnagTheme): string {
  switch (status) {
    case "finished":
    case "merged":
      return theme.success;
    case "error":
      return theme.danger;
    case "needs_input":
      return theme.accent;
    default:
      return theme.accent;
  }
}
