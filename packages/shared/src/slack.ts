/**
 * Incoming-webhook checks and the developer-wait message. Import-free so the
 * edge functions can load this file directly. Outcome and flag labels match
 * POLICY_OUTCOME_LABELS and PLAN_FLAG_LABELS in execute-policy.ts.
 */

type PolicyOutcome = "execute" | "review_before_merge" | "review_before_execution";
type ExecuteDelivery = "pr_only" | "preview_confirm" | "auto_merge";

const OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  execute: "Execute now",
  review_before_merge: "Review before merge",
  review_before_execution: "Review before execution",
};

const FLAG_LABELS: Record<string, string> = {
  schema: "Database schema",
  auth: "Authentication / permissions",
  payments: "Payments / billing",
  dependency: "Adds or upgrades a dependency",
  infrastructure: "Infrastructure / deploy config",
  security: "Security-sensitive",
  data_deletion: "Deletes user data",
  public_api: "Public API contract",
};

const SLACK_WEBHOOK_HOSTS = new Set(["hooks.slack.com", "hooks.slack-gov.com"]);

/**
 * Slack incoming webhooks only. The worker POSTs to this URL server-side, so
 * anything else would be an open redirect off the edge function.
 */
export function isSlackIncomingWebhook(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  if (!SLACK_WEBHOOK_HOSTS.has(url.hostname)) return false;
  return /^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(url.pathname);
}

export interface SlackRuleMatch {
  name: string;
  kind: "allow" | "escalate" | "builtin";
  outcome: PolicyOutcome;
  shadow: boolean;
}

const DEVELOPER_WAIT = new Set(["awaiting_approval", "awaiting_review"]);

/** True once, when auto-merge is actually on and a developer just became necessary. */
export function shouldNotifyAutoMergeWait(input: {
  previousStatus: string;
  nextStatus: string;
  delivery: ExecuteDelivery;
  shadow: boolean;
  webhookConfigured: boolean;
}): boolean {
  if (!input.webhookConfigured || input.shadow) return false;
  if (input.delivery !== "auto_merge") return false;
  if (!DEVELOPER_WAIT.has(input.nextStatus)) return false;
  return input.previousStatus !== input.nextStatus;
}

export function excerptPrompt(prompt: string, max = 200): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function escalationLines(matched: SlackRuleMatch[]): string[] {
  return matched
    .filter((rule) => !rule.shadow && rule.kind !== "allow")
    .map((rule) => `${rule.name} → ${OUTCOME_LABELS[rule.outcome]}`);
}

function hasAllow(matched: SlackRuleMatch[]): boolean {
  return matched.some((rule) => !rule.shadow && rule.kind === "allow");
}

/** Why auto-merge stopped. Shadow matches are left off; the request page still shows them. */
export function developerWaitReasons(input: {
  status: "awaiting_approval" | "awaiting_review";
  planMatched: SlackRuleMatch[];
  diffMatched: SlackRuleMatch[];
  handoffReason: string | null;
  planApproved: boolean;
}): string[] {
  if (input.status === "awaiting_approval") {
    const lines = escalationLines(input.planMatched);
    if (lines.length === 0 && !hasAllow(input.planMatched)) {
      lines.push("No allow rule matched.");
    }
    return lines.length > 0 ? lines : ["A developer needs to approve the plan."];
  }

  const lines = escalationLines(input.diffMatched);
  if (lines.length === 0) lines.push(...escalationLines(input.planMatched));
  if (input.handoffReason) lines.push(input.handoffReason);
  if (lines.length === 0 && input.planApproved) {
    lines.push("The plan was approved by a developer, so the pull request still needs review.");
  }
  if (lines.length === 0 && !hasAllow(input.diffMatched)) {
    lines.push("No allow rule matched.");
  }
  return lines.length > 0 ? lines : ["A developer needs to review the pull request."];
}

function slackEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function flagLabel(flag: string): string {
  return FLAG_LABELS[flag] ?? flag;
}

export function formatDeveloperWaitMessage(input: {
  projectName: string;
  status: "awaiting_approval" | "awaiting_review";
  prompt: string;
  requester: string | null;
  requesterVerified: boolean;
  reasons: string[];
  risk: "low" | "medium" | "high" | null;
  flags: string[];
  requestUrl: string | null;
  prUrl: string | null;
  previewUrl: string | null;
}): string {
  const action = input.status === "awaiting_approval" ? "needs plan approval" : "needs PR review";
  const who = input.requester ?? "anonymous";
  const identity = input.requester
    ? `${who} (${input.requesterVerified ? "verified" : "unverified"})`
    : who;
  const lines = [
    `*Snag · ${slackEscape(input.projectName)} · ${action}*`,
    "",
    `"${slackEscape(excerptPrompt(input.prompt))}" — ${slackEscape(identity)}`,
    "",
    "*Why it did not auto-merge:*",
    ...input.reasons.map((reason) => `• ${slackEscape(reason)}`),
  ];

  if (input.risk || input.flags.length > 0) {
    const parts = [
      input.risk ? `Risk: ${input.risk}` : null,
      input.flags.length > 0 ? input.flags.map(flagLabel).join(" · ") : null,
    ].filter((part): part is string => Boolean(part));
    lines.push("", slackEscape(parts.join(" · ")));
  }

  const links: string[] = [];
  if (input.status === "awaiting_review" && input.prUrl) {
    links.push(`<${input.prUrl}|Pull request>`);
  }
  if (input.previewUrl) links.push(`<${input.previewUrl}|Preview>`);
  if (input.requestUrl) links.push(`<${input.requestUrl}|Open in Snag>`);
  if (links.length > 0) lines.push("", links.join("  ·  "));

  return lines.join("\n");
}
