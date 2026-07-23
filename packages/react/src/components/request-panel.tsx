import { useState } from "react";

import { createSnagRequest } from "../api";
import { resolveContext } from "../config";
import type { SnagScreenshot } from "../protocol";
import {
  GLASS_SURFACE,
  glassBackdropStyle,
  glassSheetStyle,
  useSheetEnter,
} from "../sheet";
import type { SnagTheme } from "../theme";
import { RequestsList } from "./requests-list";
import { ScreenshotAnnotator } from "./screenshot-annotator";

const MAX_PROMPT_LENGTH = 2000;

type Tab = "new" | "list";
type Phase = "editing" | "submitting" | "done";

interface RequestPanelProps {
  screenshot: SnagScreenshot | null;
  theme: SnagTheme;
  onClose: () => void;
}

export function RequestPanel({ screenshot, theme, onClose }: RequestPanelProps) {
  const [tab, setTab] = useState<Tab>("new");
  const [phase, setPhase] = useState<Phase>("editing");
  const [prompt, setPrompt] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [workingScreenshot, setWorkingScreenshot] = useState<SnagScreenshot | null>(
    screenshot,
  );
  const [isAnnotated, setIsAnnotated] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [agentUrl, setAgentUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setErrorMessage("Describe the change first.");
      return;
    }
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const context = await resolveContext();
      const response = await createSnagRequest({
        prompt: trimmed,
        context,
        screenshot:
          includeScreenshot && workingScreenshot ? workingScreenshot : undefined,
        locale: typeof context.locale === "string" ? context.locale : undefined,
      });
      setAgentUrl(response.agent_url);
      setPhase("done");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
      setPhase("editing");
    }
  };

  const entered = useSheetEnter();

  if (annotating && workingScreenshot) {
    return (
      <ScreenshotAnnotator
        screenshot={workingScreenshot}
        theme={theme}
        onCancel={() => setAnnotating(false)}
        onDone={(result) => {
          setWorkingScreenshot(result);
          setIsAnnotated(result.base64 !== screenshot?.base64);
          setAnnotating(false);
        }}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Snag change request"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        ...glassBackdropStyle(entered, "rgba(0,0,0,0.35)"),
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "20px 20px 28px",
          ...glassSheetStyle(entered),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: theme.text }}>Snag</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              border: "1px solid rgba(255,255,255,0.55)",
              background: GLASS_SURFACE,
              color: theme.text,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <TabButton
            active={tab === "new"}
            label="New request"
            theme={theme}
            onClick={() => setTab("new")}
          />
          <TabButton
            active={tab === "list"}
            label="Requests"
            theme={theme}
            onClick={() => setTab("list")}
          />
        </div>

        {tab === "list" ? (
          <RequestsList theme={theme} />
        ) : phase === "done" ? (
          <div>
            <p style={{ color: theme.text, fontSize: 15 }}>
              Request submitted. An agent is working on it.
            </p>
            {agentUrl ? (
              <a
                href={agentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.accent, fontWeight: 700 }}
              >
                Open agent
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              style={{
                display: "block",
                marginTop: 20,
                width: "100%",
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: theme.accent,
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label
              htmlFor="snag-prompt"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                color: theme.textMuted,
                marginBottom: 8,
              }}
            >
              CHANGE REQUEST
            </label>
            <textarea
              id="snag-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={MAX_PROMPT_LENGTH}
              disabled={phase === "submitting"}
              placeholder="What should change on this screen?"
              rows={5}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.55)",
                background: GLASS_SURFACE,
                color: theme.text,
                padding: 12,
                fontSize: 14,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />

            {workingScreenshot ? (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 12,
                  background: GLASS_SURFACE,
                  border: "1px solid rgba(255,255,255,0.4)",
                  padding: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() => setAnnotating(true)}
                  disabled={phase === "submitting"}
                  aria-label="Mark up screenshot"
                  style={{
                    display: "block",
                    width: "100%",
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: phase === "submitting" ? "not-allowed" : "pointer",
                    position: "relative",
                  }}
                >
                  <img
                    src={`data:image/jpeg;base64,${workingScreenshot.base64}`}
                    alt="Screenshot preview"
                    style={{
                      width: "100%",
                      maxHeight: 160,
                      objectFit: "cover",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: 10,
                      bottom: 10,
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.65)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {isAnnotated ? "Marked up · Edit" : "Mark up"}
                  </span>
                </button>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                    fontSize: 13,
                    color: theme.text,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(event) => setIncludeScreenshot(event.target.checked)}
                    disabled={phase === "submitting"}
                  />
                  Include screenshot with request
                </label>
              </div>
            ) : null}

            {errorMessage ? (
              <p style={{ color: theme.danger, fontSize: 13, marginTop: 12 }}>
                {errorMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={phase === "submitting"}
              style={{
                display: "block",
                marginTop: 20,
                width: "100%",
                padding: "12px 16px",
                borderRadius: 10,
                border: "none",
                background: theme.accent,
                color: "#fff",
                fontWeight: 700,
                cursor: phase === "submitting" ? "wait" : "pointer",
                opacity: phase === "submitting" ? 0.7 : 1,
              }}
            >
              {phase === "submitting" ? "Submitting…" : "Submit request"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  theme,
  onClick,
}: {
  active: boolean;
  label: string;
  theme: SnagTheme;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        border: active ? "none" : "1px solid rgba(255,255,255,0.55)",
        background: active ? theme.accent : GLASS_SURFACE,
        color: active ? "#fff" : theme.text,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
