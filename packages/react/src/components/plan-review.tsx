import { useMemo, useState, type CSSProperties } from "react";

import { confirmSnagRequest, replyToSnagRequest } from "../api";
import { attachmentFields, messageWithAttachments, type LocalAttachment } from "../attachments";
import { parsePreviewOps, type PreviewOp } from "../dom-preview";
import type { SnagRequestPlan } from "../protocol";
import type { SnagTheme } from "../theme";
import { AttachmentPicker, COMPOSER_PADDING } from "./attachment-picker";

const MAX_FEEDBACK_LENGTH = 2000;

/**
 * The agent's plan in plain language. "Looks right" lets Snag's rules decide
 * what happens next; "Adjust" sends feedback and the agent revises the plan.
 */
export function PlanReview({
  requestId,
  plan,
  theme,
  fieldStyle,
  buttonStyle,
  onDone,
  onShowPreview,
}: {
  requestId: string;
  plan: SnagRequestPlan;
  theme: SnagTheme;
  fieldStyle: CSSProperties;
  buttonStyle: (primary: boolean, busy: boolean) => CSSProperties;
  onDone: () => void;
  /** Collapse the sheet and show `ops` on the page. */
  onShowPreview?: (ops: PreviewOp[]) => void;
}) {
  const previewOps = useMemo(() => parsePreviewOps(plan.preview), [plan.preview]);
  const [adjusting, setAdjusting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setFeedback("");
      setAttachments([]);
      setAdjusting(false);
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    void run(() => confirmSnagRequest({ request_id: requestId, decision: "approve_plan" }));

  const sendAdjustment = () => {
    const message = messageWithAttachments(feedback, attachments, MAX_FEEDBACK_LENGTH);
    if (!message) {
      setError("Describe the change or attach an image or file.");
      return;
    }
    void run(() => replyToSnagRequest(requestId, message, attachmentFields(attachments)));
  };

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: theme.text, margin: "0 0 6px" }}>
        Here's what the agent plans to change
      </p>
      {plan.changes.length > 0 ? (
        <ul style={{ margin: "0 0 8px", paddingLeft: 18, color: theme.text, fontSize: 13 }}>
          {plan.changes.map((change, index) => (
            <li key={index} style={{ marginBottom: 2 }}>
              {change}
            </li>
          ))}
        </ul>
      ) : plan.summary ? (
        <p style={{ fontSize: 13, color: theme.text, margin: "0 0 8px" }}>{plan.summary}</p>
      ) : null}
      <p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 10px" }}>
        Nothing is built until you approve. A developer may still check it before it goes live.
      </p>
      {previewOps && onShowPreview ? (
        <button
          type="button"
          onClick={() => onShowPreview(previewOps)}
          disabled={busy}
          style={{ ...buttonStyle(false, busy), width: "100%", marginBottom: 8 }}
        >
          Show me the expected result
        </button>
      ) : null}
      {adjusting ? (
        <>
          <AttachmentPicker
            attachments={attachments}
            onChange={setAttachments}
            disabled={busy}
            theme={theme}
          >
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
              disabled={busy}
              placeholder="What should be different?"
              rows={3}
              style={{ ...fieldStyle, padding: COMPOSER_PADDING }}
            />
          </AttachmentPicker>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setAdjusting(false)}
              disabled={busy}
              style={buttonStyle(false, busy)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={sendAdjustment}
              disabled={busy}
              style={buttonStyle(true, busy)}
            >
              {busy ? "Sending…" : "Send changes"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            disabled={busy}
            style={buttonStyle(false, busy)}
          >
            Adjust
          </button>
          <button type="button" onClick={approve} disabled={busy} style={buttonStyle(true, busy)}>
            {busy ? "Approving…" : "Looks right, build it"}
          </button>
        </div>
      )}
      {error ? (
        <p style={{ fontSize: 12, color: theme.danger, margin: "6px 0 0" }}>{error}</p>
      ) : null}
    </div>
  );
}
