import { useEffect, useState } from "react";

import { initSnag } from "../../../packages/react/src/config";
import { RequestPanel } from "../../../packages/react/src/components/request-panel";
import { StatusToasts, type Toast } from "../../../packages/react/src/components/status-toasts";
import type { RelayStateResponse, SnagRequestRow } from "../../../packages/react/src/protocol";
import { SnagStyles } from "../../../packages/react/src/styles";
import { defaultTheme } from "../../../packages/react/src/theme";

const PREVIEW_ENDPOINT = "https://preview.snag.invalid/state";
const PREVIEW_REQUESTER = "preview@snag.dev";

const ROWS: SnagRequestRow[] = [
  {
    id: "preview-review-1",
    prompt: "Change this",
    status: "awaiting_review",
    agent_url: "https://cursor.com/agents/preview-review-1",
    branch_name: "cursor/admin-vendors-review-heading-15d2",
    pr_url: null,
    summary:
      "I didn't commit, push, or open a pull request, because the approved plan changes no files. The requester said the original request was a test, so a branch would carry no changes. A pull request would need a commit, and an empty commit or a made-up edit would break the only-change-listed-files rule.",
    error: "The agent finished without opening a pull request.",
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T11:31:01.000Z",
  },
  {
    id: "preview-review-2",
    prompt: "What is this element? do not take action just check and let me know please",
    status: "awaiting_review",
    agent_url: "https://cursor.com/agents/preview-review-2",
    branch_name: "cursor/vendor-review-element-context-7d45",
    pr_url: null,
    summary:
      'I didn\'t change anything, because the approved plan has nothing to implement. The requester asked "What is this element? do not take action just check and let me know please", and the plan\'s file list is empty. There\'s no commit to make, so there\'s nothing to push and no pull request against main.',
    error: "The agent finished without opening a pull request.",
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T11:29:07.000Z",
  },
  {
    id: "preview-live",
    prompt: "Change this to Vendor review",
    status: "merged",
    agent_url: "https://cursor.com/agents/preview-live",
    branch_name: "cursor/vendor-review-label",
    pr_url: "https://github.com/example/snag/pull/42",
    summary: "The status pill now reads Vendor review.",
    error: null,
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-01T18:57:14.000Z",
  },
  {
    id: "preview-needs-you",
    prompt: "Move the refresh control closer to the filters",
    status: "needs_input",
    agent_url: "https://cursor.com/agents/preview-needs-you",
    branch_name: null,
    pr_url: null,
    summary:
      "Which breakpoint should the filters wrap onto a second line?\n\n## Questions for requester\n\n- Should Refresh stay on the same row as Mine at phone width?",
    error: null,
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T09:12:00.000Z",
  },
  {
    id: "preview-choices",
    prompt: "Make the header stand out more",
    status: "needs_input",
    agent_url: "https://cursor.com/agents/preview-choices",
    branch_name: null,
    pr_url: null,
    summary: [
      "The header color comes from the theme accent, so changing it touches every page.",
      "",
      "## Questions for requester",
      "",
      "- Which color should the header use?",
      "- Should the change apply on mobile too?",
      "- Anything else about the header?",
      "",
      "```json",
      JSON.stringify([
        { id: "color", text: "Which color should the header use?", choices: ["Brand blue", "Navy", "Keep it white, add a shadow"], allow_other: true },
        { id: "mobile", text: "Should the change apply on mobile too?", choices: ["Yes", "Desktop only"], allow_other: false },
        { id: "extra", text: "Anything else about the header?", choices: [] },
      ]),
      "```",
      "",
      "## Notes for developers",
      "",
      "- ThemeProvider sets the accent.",
    ].join("\n"),
    error: null,
    phase: "planning",
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T12:10:00.000Z",
  },
  {
    id: "preview-running",
    prompt: "Tighten the card padding on the right",
    status: "running",
    agent_url: "https://cursor.com/agents/preview-running",
    branch_name: "cursor/card-padding-right",
    pr_url: null,
    summary: null,
    error: null,
    phase: "implementing",
    stage_label: "Editing the sheet",
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T12:05:00.000Z",
  },
  {
    id: "preview-planning",
    prompt: "Make the empty state friendlier",
    status: "running",
    agent_url: "https://cursor.com/agents/preview-planning",
    branch_name: null,
    pr_url: null,
    summary: null,
    error: null,
    phase: "planning",
    stage_label: "Reading the requests list",
    requester: PREVIEW_REQUESTER,
    created_at: "2026-10-02T12:08:00.000Z",
  },
  {
    id: "preview-other",
    prompt: "Rename the queue heading",
    status: "queued",
    agent_url: null,
    branch_name: null,
    pr_url: null,
    summary: null,
    error: null,
    requester: "teammate@example.com",
    created_at: "2026-10-02T08:00:00.000Z",
  },
];

const STATE: RelayStateResponse = {
  enabled: true,
  requester_followups_enabled: true,
  agent_mode: "execute",
  requests: ROWS,
};

function installPreviewRelay(): void {
  const win = window as Window & { __snagPreviewRelay?: boolean };
  if (win.__snagPreviewRelay) return;
  win.__snagPreviewRelay = true;

  initSnag({
    endpoint: PREVIEW_ENDPOINT,
    projectKey: "snag_pk_preview",
    getRequester: () => PREVIEW_REQUESTER,
    getContext: () => ({
      route: "/preview",
      environment: "preview",
      app_version: "source",
    }),
    debug: false,
  });

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(PREVIEW_ENDPOINT)) return nativeFetch(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return Response.json(STATE);
    }
    return Response.json({
      id: "preview-submitted",
      agent_url: "https://cursor.com/agents/preview-submitted",
      status: "queued",
    });
  };
}

/**
 * Renders the real request sheet from packages/react/src with fixture rows.
 * No relay. Open at /preview while `npm run dev` is running.
 */
export function Preview() {
  installPreviewRelay();
  const [open, setOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showSampleToast = () =>
    setToasts([
      {
        key: `sample-${Date.now()}`,
        event: {
          row: ROWS.find((row) => row.status === "needs_input") ?? ROWS[0],
          status: "needs_input",
          title: "The agent has a question for you",
        },
      },
    ]);

  useEffect(() => {
    const previous = document.body.style.margin;
    document.body.style.margin = "0";
    return () => {
      document.body.style.margin = previous;
    };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#fafafa" }}>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ marginTop: 0 }}>Snag preview</h1>
        <p>
          This is the React sheet from <code>packages/react/src</code>, with sample requests.
          Nothing here talks to the relay.
        </p>
        {open ? null : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#5B4CF5",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Open sheet
          </button>
        )}
        {open ? null : (
          <button
            type="button"
            onClick={showSampleToast}
            style={{
              marginLeft: 8,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #5B4CF5",
              background: "transparent",
              color: "#5B4CF5",
              fontWeight: 700,
            }}
          >
            Show sample toast
          </button>
        )}
      </main>
      {open ? null : (
        <div data-snag-overlay="true" dir="ltr">
          <SnagStyles theme={defaultTheme} />
          <StatusToasts
            toasts={toasts}
            theme={defaultTheme}
            onDismiss={(key) => setToasts((current) => current.filter((toast) => toast.key !== key))}
            onOpen={() => {
              setToasts([]);
              setOpen(true);
            }}
          />
        </div>
      )}
      {open ? (
        <div data-snag-overlay="true" dir="ltr">
          <SnagStyles theme={defaultTheme} />
          <RequestPanel
            screenshot={null}
            theme={defaultTheme}
            initialTab="list"
            followupsEnabled
            agentMode="execute"
            badgeCount={1}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
