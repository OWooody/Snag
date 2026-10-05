import { useState, type CSSProperties } from "react";

import { formatRequesterAnswers, type RequesterQuestion } from "../requester-questions";
import type { SnagTheme } from "../theme";
import { FilterChip } from "./controls";

const OTHER = "\u0000other";
const MAX_OTHER_LENGTH = 300;

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
          <fieldset key={question.id} style={{ border: "none", margin: 0, padding: 0 }}>
            <legend
              style={{ padding: 0, fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}
            >
              {questions.length > 1 ? `${index + 1}. ${question.text}` : question.text}
            </legend>
            {question.choices.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {question.choices.map((option) => (
                  <FilterChip
                    key={option}
                    label={option}
                    active={choice === option}
                    theme={theme}
                    onChange={(active) =>
                      setChoices((current) => ({ ...current, [question.id]: active ? option : "" }))
                    }
                  />
                ))}
                {question.allow_other ? (
                  <FilterChip
                    label="Other"
                    active={choice === OTHER}
                    theme={theme}
                    onChange={(active) =>
                      setChoices((current) => ({ ...current, [question.id]: active ? OTHER : "" }))
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
