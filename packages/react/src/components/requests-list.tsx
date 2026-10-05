import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { confirmSnagRequest, fetchRelayState, replyToSnagRequest } from "../api";
import { resolveRequester } from "../config";
import { ACTIVE_POLL_MS, hasActiveRequest, isActiveRequest, startVisiblePolling } from "../polling";
import type { SnagRequestPhase, SnagRequestRow, SnagRequestStatus } from "../protocol";
import type { PreviewOp } from "../dom-preview";
import { displaySummaryForRequest, parseRequesterQuestions } from "../requester-questions";
import { LightMarkdown } from "../light-markdown";
import { GLASS_SURFACE, SHEET_MOTION_MS } from "../sheet";
import { withAlpha } from "../styles";
import type { SnagTheme } from "../theme";
import { FilterChip } from "./controls";
import { PlanReview } from "./plan-review";
import { QuestionForm } from "./question-form";

const POLL_INTERVAL_MS = 10_000;
const MAX_REPLY_LENGTH = 2000;
const COLLAPSED_SUMMARY_MAX_HEIGHT = 64;

interface RequestsListProps {
  theme: SnagTheme;
  /** Bump to force an immediate reload (e.g. after submit). */
  refreshKey?: number;
  followupsEnabled?: boolean;
  /** Request to show expanded and scroll to, e.g. the one just submitted. */
  focusRequestId?: string | null;
  /** Switch to the New request tab (empty-state call to action). */
  onNewRequest?: () => void;
  /** Receives the rows from every successful load. */
  onLoaded?: (rows: SnagRequestRow[]) => void;
  /** Show a plan's approximate preview on the page. */
  onShowPreview?: (requestId: string, ops: PreviewOp[]) => void;
}

export function RequestsList({
  theme,
  refreshKey = 0,
  followupsEnabled = false,
  focusRequestId = null,
  onNewRequest,
  onLoaded,
  onShowPreview,
}: RequestsListProps) {
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const [rows, setRows] = useState<SnagRequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);
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
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrolledToFocus = useRef<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [state, requester] = await Promise.all([
      fetchRelayState(),
      resolveRequester(),
    ]);
    setRows(state.requests ?? []);
    if (state.enabled) onLoadedRef.current?.(state.requests ?? []);
    if (state.agent_mode) setAgentMode(state.agent_mode);
    setCurrentRequester(requester);
    setRefreshing(false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const active = hasActiveRequest(rows);
  useEffect(
    () => startVisiblePolling(() => void load(), active ? ACTIVE_POLL_MS : POLL_INTERVAL_MS),
    [load, active],
  );

  useEffect(() => {
    if (!focusRequestId || scrolledToFocus.current === focusRequestId) return;
    const node = cardRefs.current[focusRequestId];
    if (!node) return;
    if (scrolledToFocus.current !== null) {
      scrolledToFocus.current = focusRequestId;
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    // While the sheet animates open its clipped body would take the scroll instead.
    const timer = window.setTimeout(() => {
      scrolledToFocus.current = focusRequestId;
      node.scrollIntoView({ block: "nearest" });
    }, SHEET_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [focusRequestId, rows]);

  const visibleRows = rows.filter((row) => {
    if (row.id === focusRequestId) return true;
    if (
      followupsEnabled &&
      needsAttentionOnly &&
      row.status !== "needs_input" &&
      row.status !== "awaiting_requester" &&
      row.status !== "awaiting_confirmation"
    ) {
      return false;
    }
    if (mineOnly && currentRequester && row.requester !== currentRequester) {
      return false;
    }
    return true;
  });

  const filteringNeedsYou = followupsEnabled && needsAttentionOnly;
  const hiddenByFilters = rows.length > 0;
  const emptyState = (): { title: string; message: string; caughtUp: boolean } => {
    if (filteringNeedsYou && mineOnly) {
      return {
        title: "You're all caught up",
        message: "Nothing needs you right now.",
        caughtUp: true,
      };
    }
    if (filteringNeedsYou) {
      return {
        title: "You're all caught up",
        message: "Nothing needs a reply right now. Turn off Needs you to see every request.",
        caughtUp: true,
      };
    }
    if (mineOnly && currentRequester) {
      return {
        title: "No requests from you yet",
        message: "Share what's on your mind and you can follow it here.",
        caughtUp: false,
      };
    }
    return {
      title: "No requests yet",
      message: "Share what's on your mind from any screen and track it here.",
      caughtUp: false,
    };
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {followupsEnabled ? (
          <FilterChip
            label="Needs you"
            active={needsAttentionOnly}
            theme={theme}
            onChange={setNeedsAttentionChoice}
          />
        ) : null}
        {currentRequester ? (
          <FilterChip label="Mine" active={mineOnly} theme={theme} onChange={setMineOnly} />
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="snag-focus"
          style={{
            border: "none",
            background: "transparent",
            color: theme.accent,
            fontWeight: 700,
            cursor: refreshing ? "wait" : "pointer",
            fontSize: 13,
            marginLeft: 4,
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {!loaded ? (
        <div aria-busy="true" aria-label="Loading requests">
          {[0, 1, 2].map((index) => (
            <SkeletonCard key={index} wide={index !== 1} />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyState
          theme={theme}
          {...emptyState()}
          action={
            hiddenByFilters
              ? {
                  label: "Show all requests",
                  onClick: () => {
                    setNeedsAttentionChoice(false);
                    setMineOnly(false);
                  },
                }
              : onNewRequest
                ? { label: "New request", onClick: onNewRequest }
                : null
          }
        />
      ) : (
        visibleRows.map((row) => {
          const needsRequester =
            row.status === "awaiting_requester" ||
            row.status === "awaiting_confirmation" ||
            (followupsEnabled && row.status === "needs_input");
          const focused = row.id === focusRequestId;
          return (
            <div
              key={row.id}
              ref={(node) => {
                cardRefs.current[row.id] = node;
              }}
            >
              <RequestCard
                row={row}
                theme={theme}
                followupsEnabled={followupsEnabled}
                focused={focused}
                expanded={expandedOverrides[row.id] ?? (needsRequester || focused)}
                onToggleExpanded={(next) =>
                  setExpandedOverrides((current) => ({ ...current, [row.id]: next }))
                }
                onReplied={() => void load()}
                onShowPreview={
                  onShowPreview ? (ops) => onShowPreview(row.id, ops) : undefined
                }
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function SkeletonCard({ wide }: { wide: boolean }) {
  const bar = (width: number | string, height: number) => (
    <span
      className="snag-shimmer"
      style={{ display: "block", width, height, borderRadius: 6 }}
    />
  );
  return (
    <div
      aria-hidden
      style={{
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        background: GLASS_SURFACE,
        border: "1px solid rgba(255,255,255,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {bar(84, 10)}
        {bar(64, 10)}
      </div>
      {bar(wide ? "82%" : "64%", 14)}
      {bar(wide ? "54%" : "40%", 11)}
    </div>
  );
}

function EmptyState({
  theme,
  title,
  message,
  caughtUp,
  action,
}: {
  theme: SnagTheme;
  title: string;
  message: string;
  caughtUp: boolean;
  action: { label: string; onClick: () => void } | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "28px 16px 16px",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: withAlpha(theme.accent, 0.1),
          border: `1px solid ${withAlpha(theme.accent, 0.18)}`,
          color: theme.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        {caughtUp ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M8 12.5l2.8 2.8L16 9.8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 12h-6l-2 3h-4l-2-3H2"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: theme.text }}>{title}</p>
      <p
        style={{
          margin: "6px 0 0",
          maxWidth: 300,
          fontSize: 13,
          lineHeight: 1.45,
          color: theme.textMuted,
        }}
      >
        {message}
      </p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="snag-focus"
          style={{
            marginTop: 16,
            padding: "8px 16px",
            borderRadius: 999,
            border: `1px solid ${withAlpha(theme.accent, 0.35)}`,
            background: withAlpha(theme.accent, 0.1),
            color: theme.accent,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function RequestCard({
  row,
  theme,
  followupsEnabled,
  focused = false,
  expanded,
  onToggleExpanded,
  onReplied,
  onShowPreview,
}: {
  row: SnagRequestRow;
  theme: SnagTheme;
  followupsEnabled: boolean;
  focused?: boolean;
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  onReplied: () => void;
  onShowPreview?: (ops: PreviewOp[]) => void;
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
  const reviewPlan = row.status === "awaiting_requester" && row.plan != null;
  const [writeInstead, setWriteInstead] = useState(false);
  const structuredQuestions = useMemo(
    () => (canReply ? parseRequesterQuestions(row.summary) : null),
    [canReply, row.summary],
  );
  const showQuestionForm = structuredQuestions != null && !writeInstead;
  // The plan card replaces the agent's technical summary while the requester reviews it.
  const summaryText = reviewPlan
    ? null
    : displaySummaryForRequest(row.status, row.summary, showQuestionForm);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [summaryOverflows, setSummaryOverflows] = useState(false);

  useEffect(() => {
    const node = summaryRef.current;
    setSummaryOverflows(node != null && node.scrollHeight > COLLAPSED_SUMMARY_MAX_HEIGHT + 4);
  }, [summaryText]);

  const showSteps = row.phase != null && isActiveRequest(row);
  const canToggle = summaryOverflows || canReply || canConfirm || reviewPlan;
  const showActions = expanded || !canToggle;

  const submitReply = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setReplyError("Write a reply first.");
      return;
    }
    setSending(true);
    setReplyError(null);
    try {
      await replyToSnagRequest(row.id, trimmed.slice(0, MAX_REPLY_LENGTH));
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
        border: focused ? `1px solid ${theme.accent}` : "1px solid rgba(255,255,255,0.4)",
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
          {row.stage_label && !showSteps ? (
            <span style={{ fontWeight: 600, letterSpacing: 0, color: theme.textMuted }}>
              {` · ${row.stage_label}`}
            </span>
          ) : null}
        </span>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: 0 }}>
        {row.prompt}
      </p>
      {showSteps && row.phase ? (
        <PhaseSteps phase={row.phase} caption={row.stage_label ?? null} theme={theme} />
      ) : null}
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
      {row.handoff_reason ? (
        <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 6, marginBottom: 0 }}>
          {`A developer will take it from here. ${row.handoff_reason}`}
        </p>
      ) : null}
      {row.status === "rejected" ? (
        <p
          style={{
            fontSize: 12,
            color: theme.textMuted,
            marginTop: 6,
            marginBottom: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {row.rejection_note
            ? `A developer decided not to make this change: ${row.rejection_note}`
            : "A developer decided not to make this change. File a new request if it is still needed."}
        </p>
      ) : null}
      {canReply && showActions && structuredQuestions && !writeInstead ? (
        <QuestionForm
          questions={structuredQuestions}
          theme={theme}
          sending={sending}
          error={replyError}
          fieldStyle={fieldStyle}
          onSubmit={(text) => void submitReply(text)}
          onWriteInstead={() => setWriteInstead(true)}
        />
      ) : null}
      {canReply && showActions && !showQuestionForm ? (
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
            onClick={() => void submitReply(reply)}
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
      {reviewPlan && row.plan && showActions ? (
        <PlanReview
          requestId={row.id}
          plan={row.plan}
          theme={theme}
          fieldStyle={fieldStyle}
          buttonStyle={buttonStyle}
          onDone={onReplied}
          onShowPreview={onShowPreview}
        />
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
      {row.status === "merged" ? (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ ...buttonStyle(false, false), width: "100%" }}
          >
            Reload to see it
          </button>
          <p style={{ fontSize: 11, color: theme.textMuted, margin: "6px 0 0" }}>
            It can take a minute or two to go live after merging.
          </p>
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

const PHASE_STEPS: { phase: SnagRequestPhase; label: string }[] = [
  { phase: "planning", label: "Planning" },
  { phase: "implementing", label: "Building" },
  { phase: "delivering", label: "Delivering" },
];

function PhaseSteps({
  phase,
  caption,
  theme,
}: {
  phase: SnagRequestPhase;
  caption: string | null;
  theme: SnagTheme;
}) {
  const current = PHASE_STEPS.findIndex((step) => step.phase === phase);
  const detail = caption && caption !== PHASE_STEPS[current]?.label ? caption : null;
  return (
    <div style={{ marginTop: 10 }}>
      <ol
        aria-label="Progress"
        style={{ display: "flex", gap: 6, listStyle: "none", margin: 0, padding: 0 }}
      >
        {PHASE_STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li
              key={step.phase}
              aria-current={active ? "step" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span
                className={active ? "snag-step-active" : undefined}
                style={{
                  display: "block",
                  height: 4,
                  borderRadius: 999,
                  background:
                    done || active ? theme.accent : withAlpha(theme.accent, 0.15),
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 600,
                  color: active ? theme.text : theme.textMuted,
                }}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      {detail ? (
        <p style={{ fontSize: 12, color: theme.textMuted, margin: "4px 0 0" }}>{detail}</p>
      ) : null}
    </div>
  );
}

const STATUS_LABELS: Record<SnagRequestStatus, string> = {
  queued: "QUEUED",
  running: "IN PROGRESS",
  needs_input: "NEEDS YOUR REPLY",
  awaiting_requester: "REVIEW THE PLAN",
  awaiting_approval: "WAITING FOR A DEVELOPER",
  awaiting_review: "IN DEVELOPER REVIEW",
  awaiting_confirmation: "READY FOR YOU TO CHECK",
  finished: "FINISHED",
  merged: "LIVE",
  error: "ERROR",
  rejected: "NOT APPROVED",
};

function statusColor(status: SnagRequestStatus, theme: SnagTheme): string {
  switch (status) {
    case "finished":
    case "merged":
      return theme.success;
    case "error":
      return theme.danger;
    case "rejected":
      return theme.textMuted;
    case "needs_input":
      return theme.accent;
    default:
      return theme.accent;
  }
}
