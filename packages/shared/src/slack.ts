/**
 * Incoming-webhook checks and the developer-wait message. Import-free so the
 * edge functions can load this file directly. Outcome and flag labels match
 * POLICY_OUTCOME_LABELS and PLAN_FLAG_LABELS in execute-policy.ts.
 */

type PolicyOutcome =
  | "execute"
  | "review_before_merge"
  | "review_before_execution"
  | "blocked";
type ExecuteDelivery = "pr_only" | "preview_confirm" | "auto_merge";

const OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  execute: "Execute now",
  review_before_merge: "Review before merge",
  review_before_execution: "Review before execution",
  blocked: "Do not modify these files",
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
  kind: "allow" | "escalate" | "block" | "builtin";
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

export type SlackNotificationWait = "awaiting_approval" | "awaiting_review";
export type SlackNotificationOutcome = "sent" | "failed" | "skipped";
export type SlackNotificationReason =
  | "not_auto_merge"
  | "shadow"
  | "no_webhook"
  | "decrypt_failed"
  | "invalid_webhook"
  | "slack_rejected"
  | "unreachable";

/** One Slack decision stored on a request. Never includes the webhook or the message. */
export interface SlackNotificationAttempt {
  at: string;
  wait: SlackNotificationWait;
  outcome: SlackNotificationOutcome;
  reason?: SlackNotificationReason;
  http_status?: number;
}

const SLACK_WAITS = new Set<SlackNotificationWait>(["awaiting_approval", "awaiting_review"]);
const SLACK_OUTCOMES = new Set<SlackNotificationOutcome>(["sent", "failed", "skipped"]);
const SLACK_REASONS = new Set<SlackNotificationReason>([
  "not_auto_merge",
  "shadow",
  "no_webhook",
  "decrypt_failed",
  "invalid_webhook",
  "slack_rejected",
  "unreachable",
]);

/**
 * Whether this status change should post, be recorded as skipped, or be ignored.
 * Same-status updates are ignored so a retry does not add another row.
 */
export function slackNotificationDecision(input: {
  previousStatus: string;
  nextStatus: string;
  delivery: ExecuteDelivery;
  shadow: boolean;
  webhookConfigured: boolean;
}):
  | { action: "ignore" }
  | { action: "skip"; reason: SlackNotificationReason }
  | { action: "send" } {
  if (!SLACK_WAITS.has(input.nextStatus as SlackNotificationWait)) return { action: "ignore" };
  if (input.previousStatus === input.nextStatus) return { action: "ignore" };
  if (input.delivery !== "auto_merge") return { action: "skip", reason: "not_auto_merge" };
  if (input.shadow) return { action: "skip", reason: "shadow" };
  if (!input.webhookConfigured) return { action: "skip", reason: "no_webhook" };
  return { action: "send" };
}

export function parseSlackNotifications(value: unknown): SlackNotificationAttempt[] {
  if (!Array.isArray(value)) return [];
  const attempts: SlackNotificationAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (!SLACK_WAITS.has(row.wait as SlackNotificationWait)) continue;
    if (!SLACK_OUTCOMES.has(row.outcome as SlackNotificationOutcome)) continue;
    if (typeof row.at !== "string") continue;
    const attempt: SlackNotificationAttempt = {
      at: row.at,
      wait: row.wait as SlackNotificationWait,
      outcome: row.outcome as SlackNotificationOutcome,
    };
    if (SLACK_REASONS.has(row.reason as SlackNotificationReason)) {
      attempt.reason = row.reason as SlackNotificationReason;
    }
    if (typeof row.http_status === "number" && Number.isFinite(row.http_status)) {
      attempt.http_status = row.http_status;
    }
    attempts.push(attempt);
  }
  return attempts;
}

export function slackNotificationSummary(attempt: SlackNotificationAttempt): string {
  const wait = attempt.wait === "awaiting_approval" ? "plan approval" : "PR review";
  if (attempt.outcome === "sent") return `Triggered for ${wait}. Sent.`;
  if (attempt.outcome === "skipped") {
    if (attempt.reason === "shadow") {
      return `Not triggered for ${wait}. Shadow mode is on.`;
    }
    if (attempt.reason === "no_webhook") {
      return `Not triggered for ${wait}. No Slack webhook is connected.`;
    }
    return `Not triggered for ${wait}. Auto-merge is not on for this project.`;
  }
  if (attempt.reason === "decrypt_failed") {
    return `Triggered for ${wait}. The saved webhook could not be read.`;
  }
  if (attempt.reason === "invalid_webhook") {
    return `Triggered for ${wait}. The saved webhook is not a Slack incoming webhook.`;
  }
  if (attempt.reason === "unreachable") {
    return `Triggered for ${wait}. Slack could not be reached.`;
  }
  const status = attempt.http_status ? ` (HTTP ${attempt.http_status})` : "";
  return `Triggered for ${wait}. Slack rejected the message${status}.`;
}
