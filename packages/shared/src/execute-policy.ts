export type ExecuteDelivery = "pr_only" | "preview_confirm" | "auto_merge";

export const EXECUTE_DELIVERIES = [
  "pr_only",
  "preview_confirm",
  "auto_merge",
] as const satisfies readonly ExecuteDelivery[];

export const DEFAULT_EXECUTE_DELIVERY: ExecuteDelivery = "pr_only";

export const EXECUTE_DELIVERY_LABELS: Record<ExecuteDelivery, string> = {
  pr_only: "PR only",
  preview_confirm: "Preview, then merge on requester confirmation",
  auto_merge: "Merge directly to production",
};

export const EXECUTE_DELIVERY_DESCRIPTIONS: Record<ExecuteDelivery, string> = {
  pr_only: "The agent opens a PR. Developers review and merge it as usual.",
  preview_confirm:
    "The requester checks the PR's preview deployment and taps “Looks right”. Snag then merges once CI passes.",
  auto_merge:
    "Snag merges the PR as soon as CI passes. Changes reach production without anyone reviewing the code.",
};

/** Ordered from least to most strict. */
export type PolicyOutcome = "execute" | "review_before_merge" | "review_before_execution";

export const POLICY_OUTCOMES = [
  "execute",
  "review_before_merge",
  "review_before_execution",
] as const satisfies readonly PolicyOutcome[];

export const DEFAULT_POLICY_OUTCOME: PolicyOutcome = "review_before_execution";

export const POLICY_OUTCOME_LABELS: Record<PolicyOutcome, string> = {
  execute: "Execute now",
  review_before_merge: "Review before merge",
  review_before_execution: "Review before execution",
};

export const POLICY_OUTCOME_DESCRIPTIONS: Record<PolicyOutcome, string> = {
  execute: "Implement immediately and deliver according to the delivery setting.",
  review_before_merge: "Implement immediately, but a developer must review and merge the PR.",
  review_before_execution: "A developer must approve the plan before the agent implements it.",
};

export function policyOutcomeRank(outcome: PolicyOutcome): number {
  return POLICY_OUTCOMES.indexOf(outcome);
}

export function strictestOutcome(...outcomes: PolicyOutcome[]): PolicyOutcome {
  return outcomes.reduce<PolicyOutcome>(
    (strictest, outcome) =>
      policyOutcomeRank(outcome) > policyOutcomeRank(strictest) ? outcome : strictest,
    "execute",
  );
}

export type PolicyRuleKind = "allow" | "escalate";

export const POLICY_RULE_KINDS = ["allow", "escalate"] as const satisfies readonly PolicyRuleKind[];

export type PlanRisk = "low" | "medium" | "high";

export const PLAN_RISKS = ["low", "medium", "high"] as const satisfies readonly PlanRisk[];

export const PLAN_FLAGS = [
  "schema",
  "auth",
  "payments",
  "dependency",
  "infrastructure",
  "security",
  "data_deletion",
  "public_api",
] as const;

export type PlanFlag = (typeof PLAN_FLAGS)[number];

export const PLAN_FLAG_LABELS: Record<PlanFlag, string> = {
  schema: "Database schema",
  auth: "Authentication / permissions",
  payments: "Payments / billing",
  dependency: "Adds or upgrades a dependency",
  infrastructure: "Infrastructure / deploy config",
  security: "Security-sensitive",
  data_deletion: "Deletes user data",
  public_api: "Public API contract",
};

export type PolicyConditionType =
  | "path_glob_any"
  | "path_glob_all"
  | "max_files"
  | "max_lines"
  | "risk_at_least"
  | "flag"
  | "requester_unverified"
  | "requester_not_trusted";

export const POLICY_CONDITION_LABELS: Record<PolicyConditionType, string> = {
  path_glob_any: "Any changed file matches",
  path_glob_all: "Every changed file matches",
  max_files: "More than N files changed",
  max_lines: "More than N lines changed (diff only)",
  risk_at_least: "Agent-reported risk is at least",
  flag: "Agent flagged the plan as",
  requester_unverified: "Requester identity is not verified",
  requester_not_trusted: "Requester is not on the trusted list",
};

export type PolicyCondition =
  | { type: "path_glob_any"; globs: string[] }
  | { type: "path_glob_all"; globs: string[] }
  | { type: "max_files"; max: number }
  | { type: "max_lines"; max: number }
  | { type: "risk_at_least"; level: PlanRisk }
  | { type: "flag"; flag: PlanFlag }
  | { type: "requester_unverified" }
  | { type: "requester_not_trusted" };

/** Stored in snag_policy_rules.condition. The rule matches when every condition matches. */
export interface PolicyRuleCondition {
  all: PolicyCondition[];
}

export function resolveEffectiveExecuteDelivery(
  projectDelivery: ExecuteDelivery | null | undefined,
  orgDelivery: ExecuteDelivery | null | undefined,
): ExecuteDelivery {
  return projectDelivery ?? orgDelivery ?? DEFAULT_EXECUTE_DELIVERY;
}

export function resolveEffectiveDefaultOutcome(
  projectOutcome: PolicyOutcome | null | undefined,
  orgOutcome: PolicyOutcome | null | undefined,
): PolicyOutcome {
  return projectOutcome ?? orgOutcome ?? DEFAULT_POLICY_OUTCOME;
}

export function resolveEffectivePolicyShadowMode(
  projectShadow: boolean | null | undefined,
  orgShadow: boolean | null | undefined,
): boolean {
  if (typeof projectShadow === "boolean") return projectShadow;
  if (typeof orgShadow === "boolean") return orgShadow;
  return false;
}

/**
 * Built-in escalations that apply to merge deliveries (preview_confirm,
 * auto_merge) and cannot be removed by admins.
 * Mirrored in supabase/functions/_shared/policy.ts.
 */
export const BUILTIN_POLICY_RULES = [
  {
    id: "builtin:plan_missing",
    name: "Agent did not produce a Snag plan",
    outcome: "review_before_execution",
    appliesTo: "all deliveries",
  },
  {
    id: "builtin:edited_during_planning",
    name: "Agent pushed changes during planning",
    outcome: "review_before_merge",
    appliesTo: "all deliveries",
  },
  {
    id: "builtin:outside_plan",
    name: "PR changes files that were not in the plan",
    outcome: "review_before_merge",
    appliesTo: "all deliveries",
  },
  {
    id: "builtin:ci_config",
    name: "Changes CI, lint, or type-check configuration",
    outcome: "review_before_merge",
    appliesTo: "merge deliveries",
  },
  {
    id: "builtin:tests",
    name: "Modifies or deletes existing tests",
    outcome: "review_before_merge",
    appliesTo: "merge deliveries",
  },
  {
    id: "builtin:dependencies",
    name: "Changes dependency manifests or lockfiles",
    outcome: "review_before_merge",
    appliesTo: "merge deliveries",
  },
  {
    id: "builtin:auto_merge_requester",
    name: "Requester is not verified and trusted",
    outcome: "review_before_merge",
    appliesTo: "auto_merge only",
  },
] as const satisfies readonly {
  id: string;
  name: string;
  outcome: PolicyOutcome;
  appliesTo: string;
}[];

export const SNAG_PLAN_HEADING = "## Snag plan";

export interface SnagPlan {
  files: string[];
  risk: PlanRisk;
  flags: PlanFlag[];
  summary: string | null;
}

const MAX_PLAN_FILES = 200;

/**
 * Parse the fenced JSON block under "## Snag plan" in an agent summary.
 * Returns null when the heading or a valid block is missing.
 * Mirrored in supabase/functions/_shared/plan_block.ts.
 */
export function parseSnagPlan(summary: string | null | undefined): SnagPlan | null {
  if (!summary) return null;
  const headingIndex = summary.lastIndexOf(SNAG_PLAN_HEADING);
  if (headingIndex < 0) return null;
  const section = summary.slice(headingIndex + SNAG_PLAN_HEADING.length);
  const fence = section.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/);
  if (!fence) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fence[1]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  if (!Array.isArray(value.files)) return null;
  const files = value.files
    .filter((file): file is string => typeof file === "string")
    .map(normalizeRepoPath)
    .filter((file) => file.length > 0);
  if (files.length > MAX_PLAN_FILES) return null;

  const risk = (PLAN_RISKS as readonly string[]).includes(value.risk as string)
    ? (value.risk as PlanRisk)
    : null;
  if (!risk) return null;

  const flags = Array.isArray(value.flags)
    ? value.flags.filter((flag): flag is PlanFlag =>
        (PLAN_FLAGS as readonly string[]).includes(flag as string),
      )
    : [];

  const planSummary =
    typeof value.summary === "string" && value.summary.trim()
      ? value.summary.trim().slice(0, 500)
      : null;

  return { files: [...new Set(files)], risk, flags: [...new Set(flags)], summary: planSummary };
}

export function normalizeRepoPath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Remove the machine-readable "## Snag plan" section before showing a summary to people. */
export function stripSnagPlanSection(summary: string): string {
  const headingIndex = summary.lastIndexOf(SNAG_PLAN_HEADING);
  if (headingIndex < 0) return summary;
  const after = summary.slice(headingIndex + SNAG_PLAN_HEADING.length);
  const nextHeading = after.match(/\n##\s/);
  const rest = nextHeading ? after.slice(nextHeading.index) : "";
  return [summary.slice(0, headingIndex).trim(), rest.trim()].filter(Boolean).join("\n\n");
}

/**
 * Follow-up sent to the agent when Snag (or a developer) lets a plan proceed.
 * Mirrored in supabase/functions/_shared/execute_prompts.ts.
 */
export function buildImplementationPrompt(options: {
  baseRef: string;
  approvedBy: "policy" | "developer";
  developerNote?: string | null;
}): string {
  const lines = [
    options.approvedBy === "developer"
      ? "A developer approved your plan via Snag. Implement it now."
      : "Snag's rules approved your plan. Implement it now.",
    "",
    '- Only change the files listed in your "## Snag plan" block. If you must touch other files, explain why under "## Notes for developers".',
    `- Commit, push your branch, and open a pull request against \`${options.baseRef}\`.`,
    "- Do NOT merge the pull request. Snag decides whether and when it is merged.",
    "- Do not modify CI configuration, existing tests, or dependency manifests unless your plan listed them.",
    '- If you hit a product question only the requester can answer, stop and list it under "## Questions for requester".',
    '- Put technical notes under "## Notes for developers".',
  ];
  const note = options.developerNote?.trim();
  if (note) {
    lines.push("", "Developer note:", note);
  }
  return lines.join("\n");
}
