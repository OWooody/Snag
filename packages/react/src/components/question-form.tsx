import { useState, type CSSProperties } from "react";

import { formatRequesterAnswers, type RequesterQuestion } from "../requester-questions";
import { GLASS_SURFACE, SNAG_EASE } from "../sheet";
import { withAlpha } from "../styles";
import type { SnagTheme } from "../theme";

const OTHER = "\u0000other";
const MAX_OTHER_LENGTH = 300;

/** Full-width answer row. The check column stays put so selecting a choice does not shift the label. */
function ChoiceButton({
  label,
  active,
  theme,
  onClick,
}: {
  label: string;
  active: boolean;
  theme: SnagTheme;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="snag-focus"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        margin: 0,
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${active ? withAlpha(theme.accent, 0.35) : "rgba(15,15,25,0.08)"}`,
        background: active ? withAlpha(theme.accent, 0.12) : GLASS_SURFACE,
        color: active ? theme.accent : theme.text,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
        textAlign: "start",
        whiteSpace: "normal",
        overflowWrap: "break-word",
        cursor: "pointer",
        userSelect: "none",
        transition: `background 200ms ${SNAG_EASE}, border-color 200ms ${SNAG_EASE}, color 200ms ${SNAG_EASE}`,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 19,
          flexShrink: 0,
          opacity: active ? 1 : 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>{label}</span>
    </button>
  );
}

/**
 * Agent questions as tappable choices with an optional free-text answer.
 * Answers are sent as one `Q: … / A: …` reply.
 */
export function QuestionForm({
  questions,
  theme,
  sending,
  error,
  fieldStyle,
  onSubmit,
  onWriteInstead,
}: {
  questions: RequesterQuestion[];
  theme: SnagTheme;
  sending: boolean;
  error: string | null;
  fieldStyle: CSSProperties;
  onSubmit: (reply: string) => void;
  onWriteInstead: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});

  const answerFor = (question: RequesterQuestion): string | undefined => {
    const choice = choices[question.id];
    if (question.choices.length === 0 || choice === OTHER) return others[question.id];
    return choice;
  };
  const answered = questions.filter((question) => answerFor(question)?.trim()).length;

  const submit = () => {
    const answers = Object.fromEntries(questions.map((question) => [question.id, answerFor(question)]));
    onSubmit(formatRequesterAnswers(questions, answers));
  };

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
      {questions.map((question, index) => {
        const choice = choices[question.id];
        const showOther = question.choices.length === 0 || choice === OTHER;
        return (
          <fieldset
            key={question.id}
            style={{
              border: "none",
              margin: 0,
              padding: 0,
              minWidth: 0,
              minInlineSize: 0,
              width: "100%",
            }}
          >
            <legend
              style={{
                display: "block",
                width: "100%",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.45,
                color: theme.text,
                marginBottom: 8,
              }}
            >
              {questions.length > 1 ? `${index + 1}. ${question.text}` : question.text}
            </legend>
            {question.choices.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                {question.choices.map((option) => (
                  <ChoiceButton
                    key={option}
                    label={option}
                    active={choice === option}
                    theme={theme}
                    onClick={() =>
                      setChoices((current) => ({
                        ...current,
                        [question.id]: choice === option ? "" : option,
                      }))
                    }
                  />
                ))}
                {question.allow_other ? (
                  <ChoiceButton
                    label="Other"
                    active={choice === OTHER}
                    theme={theme}
                    onClick={() =>
                      setChoices((current) => ({
                        ...current,
                        [question.id]: choice === OTHER ? "" : OTHER,
                      }))
                    }
                  />
                ) : null}
              </div>
            ) : null}
            {showOther ? (
              <textarea
                value={others[question.id] ?? ""}
                onChange={(event) =>
                  setOthers((current) => ({
                    ...current,
                    [question.id]: event.target.value.slice(0, MAX_OTHER_LENGTH),
                  }))
                }
                disabled={sending}
                aria-label={question.text}
                placeholder="Your answer…"
                rows={2}
                style={{ ...fieldStyle, marginTop: question.choices.length > 0 ? 8 : 0 }}
              />
            ) : null}
          </fieldset>
        );
      })}
      {error ? <p style={{ fontSize: 12, color: theme.danger, margin: 0 }}>{error}</p> : null}
      <div>
        <button
          type="button"
          onClick={submit}
          disabled={sending || answered === 0}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: theme.accent,
            color: "#fff",
            fontWeight: 700,
            cursor: sending ? "wait" : answered === 0 ? "not-allowed" : "pointer",
            opacity: answered === 0 ? 0.6 : 1,
            fontSize: 13,
          }}
        >
          {sending
            ? "Sending…"
            : questions.length > 1
              ? `Send answers (${answered}/${questions.length})`
              : "Send answer"}
        </button>
        <button
          type="button"
          onClick={onWriteInstead}
          disabled={sending}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            marginTop: 8,
            color: theme.accent,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Reply in your own words
        </button>
      </div>
    </div>
  );
}
