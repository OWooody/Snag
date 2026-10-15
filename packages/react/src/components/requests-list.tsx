import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  closeSnagRequest,
  confirmSnagRequest,
  createSnagRequest,
  fetchRelayState,
  replyToSnagRequest,
} from "../api";
import { attachmentFields, messageWithAttachments, type LocalAttachment } from "../attachments";
import { resolveContext, resolveRequester } from "../config";
import { ACTIVE_POLL_MS, hasActiveRequest, isActiveRequest, startVisiblePolling } from "../polling";
import type { SnagRequestPhase, SnagRequestRow, SnagRequestStatus } from "../protocol";
import type { PreviewOp } from "../dom-preview";
import { displaySummaryForRequest, parseRequesterQuestions } from "../requester-questions";
import { LightMarkdown } from "../light-markdown";
import { GLASS_SURFACE, SHEET_MOTION_MS } from "../sheet";
import { withAlpha } from "../styles";
import type { SnagTheme } from "../theme";
import { AttachmentPicker, COMPOSER_PADDING } from "./attachment-picker";
import { FilterChip, RefreshButton } from "./controls";
import { PlanReview } from "./plan-review";
import { QuestionForm } from "./question-form";

const POLL_INTERVAL_MS = 10_000;
const MAX_REPLY_LENGTH = 2000;
const MAX_CLOSE_NOTE_LENGTH = 500;
const COLLAPSED_SUMMARY_MAX_HEIGHT = 64;

const CLOSABLE_STATUSES: ReadonlySet<SnagRequestStatus> = new Set([
  "queued",
  "running",
  "needs_input",
  "awaiting_requester",
  "awaiting_approval",
  "awaiting_review",
  "awaiting_confirmation",
]);

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
  /** A follow-up request was created; focus it once the list reloads. */
  onContinued?: (requestId: string) => void;
}

export function RequestsList({
  theme,
  refreshKey = 0,
  followupsEnabled = false,
  focusRequestId = null,
  onNewRequest,
  onLoaded,
  onShowPreview,
  onContinued,
}: RequestsListProps) {
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const [rows, setRows] = useState<SnagRequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);
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
    const [state, requester] = await Promise.all([
      fetchRelayState(),
      resolveRequester(),
    ]);
    setRows(state.requests ?? []);
    if (state.enabled) onLoadedRef.current?.(state.requests ?? []);
    if (state.agent_mode) setAgentMode(state.agent_mode);
    setCurrentRequester(requester);
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
        <RefreshButton theme={theme} onRefresh={load} />
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
          const parent = row.continues_request_id
            ? rows.find((candidate) => candidate.id === row.continues_request_id)
            : undefined;
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
                currentRequester={currentRequester}
                followupsEnabled={followupsEnabled}
                focused={focused}
                expanded={expandedOverrides[row.id] ?? (needsRequester || focused)}
                onToggleExpanded={(next) =>
                  setExpandedOverrides((current) => ({ ...current, [row.id]: next }))
                }
                onReplied={() => void load()}
                continuedFrom={
                  row.continues_request_id
                    ? { id: row.continues_request_id, prompt: parent?.prompt ?? null }
                    : null
                }
                onOpenEarlier={
                  parent
                    ? () => {
                        setExpandedOverrides((current) => ({ ...current, [parent.id]: true }));
                        cardRefs.current[parent.id]?.scrollIntoView({
                          block: "nearest",
                          behavior: "smooth",
                        });
                      }
                    : undefined
                }
                onContinued={(id) => {
                  onContinued?.(id);
                  void load();
                }}
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

function ownsRequest(row: SnagRequestRow, currentRequester: string | null): boolean {
  if (row.requester) return currentRequester != null && row.requester === currentRequester;
  return currentRequester == null;
}

function RequestCard({
  row,
  theme,
  currentRequester,
  followupsEnabled,
  focused = false,
  expanded,
  onToggleExpanded,
  onReplied,
  continuedFrom = null,
  onOpenEarlier,
  onContinued,
  onShowPreview,
}: {
  row: SnagRequestRow;
  theme: SnagTheme;
  currentRequester: string | null;
  followupsEnabled: boolean;
  focused?: boolean;
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  onReplied: () => void;
  continuedFrom?: { id: string; prompt: string | null } | null;
  onOpenEarlier?: () => void;
  onContinued?: (requestId: string) => void;
  onShowPreview?: (ops: PreviewOp[]) => void;
}) {
  const link = row.pr_url ?? row.agent_url;
  const [reply, setReply] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<LocalAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackAttachments, setFeedbackAttachments] = useState<LocalAttachment[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const canReply = followupsEnabled && row.status === "needs_input";
  const canConfirm = row.status === "awaiting_confirmation";
  const reviewPlan = row.status === "awaiting_requester" && row.plan != null;
  const owned = ownsRequest(row, currentRequester);
  const canClose = owned && CLOSABLE_STATUSES.has(row.status);
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

  const submitReply = async (text: string, attachments: LocalAttachment[]) => {
    const message = messageWithAttachments(text, attachments, MAX_REPLY_LENGTH);
    if (!message) {
      setReplyError("Write a reply or attach an image or file.");
      return;
    }
    setSending(true);
    setReplyError(null);
    try {
      await replyToSnagRequest(row.id, message, attachmentFields(attachments));
      setReply("");
      setReplyAttachments([]);
      onReplied();
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Reply failed");
    } finally {
      setSending(false);
    }
  };

  const confirm = async (decision: "looks_right" | "not_right") => {
    const message = messageWithAttachments(feedback, feedbackAttachments, MAX_REPLY_LENGTH);
    if (decision === "not_right" && !message) {
      setConfirmError("Describe what is not right, or attach an image or file.");
      return;
    }
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmSnagRequest(
        decision === "looks_right"
          ? { request_id: row.id, decision }
          : {
              request_id: row.id,
              decision,
              feedback: message,
              ...attachmentFields(feedbackAttachments),
            },
      );
      setFeedback("");
      setFeedbackAttachments([]);
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
          {row.status === "closed_by_requester"
            ? owned
              ? "CLOSED BY YOU"
              : "CLOSED"
            : (STATUS_LABELS[row.status] ?? row.status.toUpperCase())}
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
      {continuedFrom ? (
        <p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 6px" }}>
          Follow-up to{" "}
          {continuedFrom.prompt && onOpenEarlier ? (
            <button
              type="button"
              onClick={onOpenEarlier}
              className="snag-focus"
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                color: theme.accent,
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {clipPrompt(continuedFrom.prompt)}
            </button>
          ) : (
            <span style={{ fontWeight: 600 }}>
              {continuedFrom.prompt ? clipPrompt(continuedFrom.prompt) : "an earlier request"}
            </span>
          )}
        </p>
      ) : null}
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
      {row.status === "closed_by_requester" ? (
        <p
          style={{
            fontSize: 12,
            color: theme.textMuted,
            marginTop: 6,
            marginBottom: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {closedSummary(owned, row.close_note)}
        </p>
      ) : null}
      {canReply && showActions && structuredQuestions && !writeInstead ? (
        <QuestionForm
          questions={structuredQuestions}
          theme={theme}
          sending={sending}
          error={replyError}
          fieldStyle={fieldStyle}
          onSubmit={(text, attachments) => void submitReply(text, attachments)}
          onWriteInstead={() => setWriteInstead(true)}
        />
      ) : null}
      {canReply && showActions && !showQuestionForm ? (
        <div style={{ marginTop: 10 }}>
          <AttachmentPicker
            attachments={replyAttachments}
            onChange={setReplyAttachments}
            disabled={sending}
            theme={theme}
          >
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value.slice(0, MAX_REPLY_LENGTH))}
              disabled={sending}
              placeholder="Answer the questions above…"
              rows={3}
              style={{ ...fieldStyle, padding: COMPOSER_PADDING }}
            />
          </AttachmentPicker>
          {replyError ? (
            <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>
              {replyError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void submitReply(reply, replyAttachments)}
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
              <AttachmentPicker
                attachments={feedbackAttachments}
                onChange={setFeedbackAttachments}
                disabled={confirming}
                theme={theme}
              >
                <textarea
                  value={feedback}
                  onChange={(event) =>
                    setFeedback(event.target.value.slice(0, MAX_REPLY_LENGTH))
                  }
                  disabled={confirming}
                  placeholder="What should be different?"
                  rows={3}
                  style={{ ...fieldStyle, padding: COMPOSER_PADDING }}
                />
              </AttachmentPicker>
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
      {canClose ? (
        <CloseRequest
          requestId={row.id}
          status={row.status}
          hasPullRequest={row.pr_url != null}
          divided={canReply || canConfirm || reviewPlan}
          theme={theme}
          fieldStyle={fieldStyle}
          onClosed={onReplied}
        />
      ) : null}
      {!canReply && !canConfirm && !reviewPlan ? (
        <ContinueRequest
          requestId={row.id}
          status={row.status}
          theme={theme}
          fieldStyle={fieldStyle}
          buttonStyle={buttonStyle}
          onContinued={onContinued}
        />
      ) : null}
    </div>
  );
}

function closedSummary(owned: boolean, note: string | null | undefined): string {
  const who = owned ? "You closed this request." : "The requester closed this request.";
  const trimmed = note?.trim();
  if (!trimmed) return `${who} Nothing further will be built from it.`;
  return `${who} ${trimmed}`;
}

function closeExplanation(status: SnagRequestStatus, hasPullRequest: boolean): string {
  const pullRequest = hasPullRequest
    ? " An open pull request stays open until someone closes it on the repository."
    : "";
  switch (status) {
    case "queued":
    case "running":
      return "Snag will stop following this request. If an agent is already working, it may finish in the background, but the result will not be merged or sent on for review.";
    case "needs_input":
    case "awaiting_requester":
      return "You will not need to reply, and nothing further will be built from this request.";
    case "awaiting_approval":
      return "A developer will no longer be asked to approve this, and nothing further will be built from it.";
    case "awaiting_review":
      return `A developer will no longer be asked to review this.${pullRequest}`;
    case "awaiting_confirmation":
      return `Snag will not merge this change.${pullRequest}`;
    default:
      return "Snag will stop following this request.";
  }
}

function CloseRequest({
  requestId,
  status,
  hasPullRequest,
  divided,
  theme,
  fieldStyle,
  onClosed,
}: {
  requestId: string;
  status: SnagRequestStatus;
  hasPullRequest: boolean;
  divided: boolean;
  theme: SnagTheme;
  fieldStyle: {
    width: string;
    boxSizing: "border-box";
    borderRadius: number;
    border: string;
    background: string;
    padding: number;
    fontSize: number;
    color: string;
    resize: "vertical";
  };
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await closeSnagRequest(requestId, note);
      setNote("");
      setOpen(false);
      onClosed();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not close the request");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={panelRef}
      style={{
        marginTop: 10,
        ...(divided
          ? { paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.45)" }
          : {}),
      }}
    >
      {open ? (
        <div
          style={{
            padding: 10,
            borderRadius: 10,
            background: "rgba(255,255,255,0.45)",
            border: "1px solid rgba(255,255,255,0.55)",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>
            Close this request?
          </p>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: theme.textMuted,
              margin: "4px 0 8px",
            }}
          >
            {closeExplanation(status, hasPullRequest)}
          </p>
          <textarea
            value={note}
            autoFocus
            onChange={(event) => {
              setNote(event.target.value.slice(0, MAX_CLOSE_NOTE_LENGTH));
              if (error) setError(null);
            }}
            disabled={sending}
            placeholder="Add a note for the developer (optional)"
            rows={2}
            aria-label="Note for the developer"
            style={fieldStyle}
          />
          {error ? (
            <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={sending}
              className="snag-focus"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${withAlpha(theme.textMuted, 0.45)}`,
                background: "transparent",
                color: theme.text,
                fontWeight: 700,
                cursor: sending ? "wait" : "pointer",
                fontSize: 13,
              }}
            >
              Keep it open
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="snag-focus"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: theme.danger,
                color: "#fff",
                fontWeight: 700,
                cursor: sending ? "wait" : "pointer",
                fontSize: 13,
              }}
            >
              {sending ? "Closing…" : "Close request"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="snag-focus"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: theme.textMuted,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Close request
        </button>
      )}
    </div>
  );
}

function clipPrompt(prompt: string, max = 72): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function continuationHint(status: SnagRequestStatus): string {
  switch (status) {
    case "merged":
      return "This change is already live. Your note starts a new request and brings this context with it.";
    case "finished":
      return "This request is finished. Your note starts a new request and brings this context with it.";
    case "error":
      return "Say what you still want. Your note starts a new request and brings this context with it.";
    case "rejected":
      return "Say what should be different. Your note starts a new request and brings this context with it.";
    case "queued":
    case "running":
    case "awaiting_approval":
    case "awaiting_review":
      return "This request is still in progress. A follow-up starts a separate request and leaves this one alone.";
    default:
      return "Your note starts a new request and brings this context with it.";
  }
}

function ContinueRequest({
  requestId,
  status,
  theme,
  fieldStyle,
  buttonStyle,
  onContinued,
}: {
  requestId: string;
  status: SnagRequestStatus;
  theme: SnagTheme;
  fieldStyle: {
    width: string;
    boxSizing: "border-box";
    borderRadius: number;
    border: string;
    background: string;
    padding: number;
    fontSize: number;
    color: string;
    resize: "vertical";
  };
  buttonStyle: (primary: boolean, busy: boolean) => CSSProperties;
  onContinued?: (requestId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const submit = async () => {
    const message = messageWithAttachments(text, attachments, MAX_REPLY_LENGTH);
    if (!message) {
      setError("Write what should change, or attach an image or file.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await createSnagRequest({
        prompt: message,
        context: await resolveContext(),
        continues_request_id: requestId,
        ...attachmentFields(attachments),
      });
      setText("");
      setAttachments([]);
      setOpen(false);
      onContinued?.(created.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not start the follow-up");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      ref={panelRef}
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid rgba(255,255,255,0.45)",
      }}
    >
      {open ? (
        <>
          <p style={{ fontSize: 13, fontWeight: 700, color: theme.text, margin: 0 }}>
            Continue this request
          </p>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: theme.textMuted,
              margin: "4px 0 8px",
            }}
          >
            {continuationHint(status)}
          </p>
          <AttachmentPicker
            attachments={attachments}
            onChange={setAttachments}
            disabled={sending}
            theme={theme}
          >
            <textarea
              value={text}
              autoFocus
              onChange={(event) => {
                setText(event.target.value.slice(0, MAX_REPLY_LENGTH));
                if (error) setError(null);
              }}
              disabled={sending}
              placeholder="What should we change next?"
              rows={3}
              style={{ ...fieldStyle, padding: COMPOSER_PADDING }}
            />
          </AttachmentPicker>
          {error ? (
            <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>{error}</p>
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={sending}
              className="snag-focus"
              style={buttonStyle(false, sending)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="snag-focus"
              style={buttonStyle(true, sending)}
            >
              {sending ? "Starting…" : "Start follow-up"}
            </button>
          </div>
        </>
      ) : status === "merged" ||
        status === "finished" ||
        status === "error" ||
        status === "rejected" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="snag-focus"
          style={{ ...buttonStyle(false, false), width: "100%" }}
        >
          Continue this request
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="snag-focus"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: theme.accent,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Continue in a new request
        </button>
      )}
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
  closed_by_requester: "CLOSED",
};

function statusColor(status: SnagRequestStatus, theme: SnagTheme): string {
  switch (status) {
    case "finished":
    case "merged":
      return theme.success;
    case "error":
      return theme.danger;
    case "rejected":
    case "closed_by_requester":
      return theme.textMuted;
    case "needs_input":
      return theme.accent;
    default:
      return theme.accent;
  }
}
