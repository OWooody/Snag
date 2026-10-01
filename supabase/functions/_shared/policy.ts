/**
 * Execute-mode policy evaluation. Pure and dependency-free so it can be unit
 * tested and reused by the webhook, relay polling fallback, and delivery worker.
 *
 * Rules only ever make the outcome stricter: allow rules lift the base from the
 * project default to `execute`, and every matched escalation (admin-defined or
 * built-in) can only raise it. Built-in rule ids and names are mirrored in
 * packages/shared/src/execute-policy.ts (BUILTIN_POLICY_RULES).
 */

import type { PlanRisk } from "./plan_block.ts";

export type ExecuteDelivery = "pr_only" | "preview_confirm" | "auto_merge";
export type PolicyOutcome =
  | "execute"
  | "review_before_merge"
  | "review_before_execution";
export type PolicyStage = "plan" | "diff";

const OUTCOME_ORDER: PolicyOutcome[] = [
  "execute",
  "review_before_merge",
  "review_before_execution",
];

const RISK_ORDER: PlanRisk[] = ["low", "medium", "high"];

export function strictestOutcome(...outcomes: PolicyOutcome[]): PolicyOutcome {
  return outcomes.reduce<PolicyOutcome>(
    (strictest, outcome) =>
      OUTCOME_ORDER.indexOf(outcome) > OUTCOME_ORDER.indexOf(strictest)
        ? outcome
        : strictest,
    "execute",
  );
}

export interface PolicyRule {
  id: string;
  name: string;
  enabled: boolean;
  shadow: boolean;
  kind: "allow" | "escalate";
  outcome: PolicyOutcome;
  condition: unknown;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed" | "unknown";
  previousPath?: string | null;
}

export interface PolicyRequester {
  id: string | null;
  verified: boolean;
  trusted: boolean;
}

export interface PolicyInput {
  stage: PolicyStage;
  files: ChangedFile[];
  /** Total additions + deletions. Null at plan stage. */
  linesChanged: number | null;
  risk: PlanRisk | null;
  flags: string[];
  /** Files the agent listed in its plan. Used at diff stage. */
  planFiles: string[] | null;
  planMissing: boolean;
  editedDuringPlanning: boolean;
  requester: PolicyRequester;
  rules: PolicyRule[];
  defaultOutcome: PolicyOutcome;
  delivery: ExecuteDelivery;
  projectShadow: boolean;
  headSha?: string | null;
  now?: Date;
}

export interface PolicyMatchedRule {
  id: string;
  name: string;
  kind: "allow" | "escalate" | "builtin";
  outcome: PolicyOutcome;
  shadow: boolean;
}

export interface PolicyStageDecision {
  stage: PolicyStage;
  computed_outcome: PolicyOutcome;
  outcome: PolicyOutcome;
  shadow_outcome: PolicyOutcome;
  project_shadow: boolean;
  matched: PolicyMatchedRule[];
  reasons: string[];
  delivery: ExecuteDelivery;
  head_sha?: string | null;
  evaluated_at: string;
}

export const CI_CONFIG_GLOBS = [
  ".github/**",
  ".gitlab-ci.yml",
  ".circleci/**",
  "azure-pipelines.yml",
  "bitbucket-pipelines.yml",
  "**/.eslintrc*",
  "**/eslint.config.*",
  "**/.prettierrc*",
  "**/prettier.config.*",
  "**/tsconfig*.json",
  "**/jest.config.*",
  "**/vitest.config.*",
  "**/playwright.config.*",
  "**/.swiftlint.yml",
];

export const TEST_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.*",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/Tests/**",
];

export const DEPENDENCY_GLOBS = [
  "**/package.json",
  "**/package-lock.json",
  "**/npm-shrinkwrap.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/bun.lock",
  "**/deno.json",
  "**/deno.lock",
  "**/import_map.json",
  "**/Package.swift",
  "**/Package.resolved",
  "**/Podfile",
  "**/Podfile.lock",
  "**/Cartfile*",
  "**/Gemfile",
  "**/Gemfile.lock",
  "**/requirements*.txt",
  "**/Pipfile*",
  "**/poetry.lock",
  "**/pyproject.toml",
  "**/go.mod",
  "**/go.sum",
  "**/Cargo.toml",
  "**/Cargo.lock",
  "**/composer.json",
  "**/composer.lock",
  "**/build.gradle*",
  "**/settings.gradle*",
  "**/gradle/libs.versions.toml",
];

const globCache = new Map<string, RegExp>();

/**
 * Minimal glob matcher: `**` crosses directories, `*` and `?` stay within a
 * segment. A glob without `/` matches the file name at any depth.
 */
export function matchGlob(glob: string, path: string): boolean {
  const trimmed = glob.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (!trimmed) return false;
  let regex = globCache.get(trimmed);
  if (!regex) {
    regex = globToRegExp(trimmed);
    globCache.set(trimmed, regex);
  }
  if (regex.test(path)) return true;
  if (!trimmed.includes("/")) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    return regex.test(base);
  }
  return false;
}

function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function anyFileMatches(files: ChangedFile[], globs: string[]): boolean {
  return files.some((file) =>
    globs.some((glob) =>
      matchGlob(glob, file.path) ||
      (file.previousPath ? matchGlob(glob, file.previousPath) : false)
    )
  );
}

type ConditionResult = boolean | "invalid";

function evaluateCondition(
  condition: unknown,
  input: PolicyInput,
): ConditionResult {
  if (!condition || typeof condition !== "object") return "invalid";
  const c = condition as Record<string, unknown>;
  const globs = Array.isArray(c.globs)
    ? c.globs.filter((g): g is string => typeof g === "string")
    : null;
  switch (c.type) {
    case "path_glob_any":
      if (!globs?.length) return "invalid";
      return anyFileMatches(input.files, globs);
    case "path_glob_all":
      if (!globs?.length) return "invalid";
      return input.files.length > 0 &&
        input.files.every((file) => anyFileMatches([file], globs));
    case "max_files":
      if (typeof c.max !== "number") return "invalid";
      return input.files.length > c.max;
    case "max_lines":
      if (typeof c.max !== "number") return "invalid";
      return input.linesChanged !== null && input.linesChanged > c.max;
    case "risk_at_least": {
      const level = RISK_ORDER.indexOf(c.level as PlanRisk);
      if (level < 0) return "invalid";
      return input.risk !== null && RISK_ORDER.indexOf(input.risk) >= level;
    }
    case "flag":
      if (typeof c.flag !== "string") return "invalid";
      return input.flags.includes(c.flag);
    case "requester_unverified":
      return !input.requester.verified;
    case "requester_not_trusted":
      return !input.requester.trusted;
    default:
      return "invalid";
  }
}

/**
 * A rule matches when every condition matches. Malformed conditions fail
 * closed: an escalate rule with an unreadable condition matches, an allow rule
 * does not.
 */
export function ruleMatches(rule: PolicyRule, input: PolicyInput): boolean {
  const all = (rule.condition as { all?: unknown } | null)?.all;
  if (!Array.isArray(all) || all.length === 0) {
    return rule.kind === "escalate";
  }
  for (const condition of all) {
    const result = evaluateCondition(condition, input);
    if (result === "invalid") return rule.kind === "escalate";
    if (!result) return false;
  }
  return true;
}

function builtinMatches(input: PolicyInput): PolicyMatchedRule[] {
  const matched: PolicyMatchedRule[] = [];
  const add = (id: string, name: string, outcome: PolicyOutcome) =>
    matched.push({ id, name, kind: "builtin", outcome, shadow: false });

  if (input.stage === "plan" && input.planMissing) {
    add(
      "builtin:plan_missing",
      "Agent did not produce a Snag plan",
      "review_before_execution",
    );
  }
  if (input.editedDuringPlanning) {
    add(
      "builtin:edited_during_planning",
      "Agent pushed changes during planning",
      "review_before_merge",
    );
  }
  if (input.stage === "diff" && input.planFiles) {
    const planned = new Set(input.planFiles);
    if (input.files.some((file) => !planned.has(file.path))) {
      add(
        "builtin:outside_plan",
        "PR changes files that were not in the plan",
        "review_before_merge",
      );
    }
  }

  const mergeDelivery = input.delivery === "preview_confirm" ||
    input.delivery === "auto_merge";
  if (mergeDelivery) {
    if (anyFileMatches(input.files, CI_CONFIG_GLOBS)) {
      add(
        "builtin:ci_config",
        "Changes CI, lint, or type-check configuration",
        "review_before_merge",
      );
    }
    if (input.stage === "diff") {
      const touchedExistingTests = input.files.some((file) =>
        file.status !== "added" && anyFileMatches([file], TEST_GLOBS)
      );
      if (touchedExistingTests) {
        add(
          "builtin:tests",
          "Modifies or deletes existing tests",
          "review_before_merge",
        );
      }
    }
    if (
      anyFileMatches(input.files, DEPENDENCY_GLOBS) ||
      input.flags.includes("dependency")
    ) {
      add(
        "builtin:dependencies",
        "Changes dependency manifests or lockfiles",
        "review_before_merge",
      );
    }
  }

  if (
    input.delivery === "auto_merge" &&
    !(input.requester.verified && input.requester.trusted)
  ) {
    add(
      "builtin:auto_merge_requester",
      "Requester is not verified and trusted",
      "review_before_merge",
    );
  }

  return matched;
}

function combine(
  matched: PolicyMatchedRule[],
  input: PolicyInput,
): PolicyOutcome {
  const allowMatched = matched.some((rule) => rule.kind === "allow");
  let base: PolicyOutcome = allowMatched ? "execute" : input.defaultOutcome;
  if (input.delivery === "auto_merge" && !allowMatched) {
    base = strictestOutcome(base, "review_before_merge");
  }
  const escalations = matched
    .filter((rule) => rule.kind !== "allow")
    .map((rule) => rule.outcome);
  return strictestOutcome(base, ...escalations);
}

function forStage(outcome: PolicyOutcome, stage: PolicyStage): PolicyOutcome {
  if (stage === "diff" && outcome === "review_before_execution") {
    return "review_before_merge";
  }
  return outcome;
}

export function evaluatePolicy(input: PolicyInput): PolicyStageDecision {
  const matched: PolicyMatchedRule[] = [...builtinMatches(input)];
  for (const rule of input.rules) {
    if (!rule.enabled) continue;
    if (!ruleMatches(rule, input)) continue;
    matched.push({
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      outcome: rule.outcome,
      shadow: rule.shadow,
    });
  }

  const enforced = matched.filter((rule) => !rule.shadow);
  const computed = forStage(combine(enforced, input), input.stage);
  const shadowOutcome = forStage(combine(matched, input), input.stage);

  const outcome = input.projectShadow
    ? forStage("review_before_execution", input.stage)
    : computed;

  const reasons: string[] = [];
  if (!enforced.some((rule) => rule.kind === "allow")) {
    reasons.push(`No allow rule matched; default is ${input.defaultOutcome}.`);
  }
  for (const rule of matched) {
    reasons.push(
      `${rule.shadow ? "[shadow] " : ""}${rule.name} → ${rule.outcome}`,
    );
  }
  if (input.projectShadow) {
    reasons.push(
      `Shadow mode: rules computed ${computed}, routed to ${outcome}.`,
    );
  }

  return {
    stage: input.stage,
    computed_outcome: computed,
    outcome,
    shadow_outcome: shadowOutcome,
    project_shadow: input.projectShadow,
    matched,
    reasons,
    delivery: input.delivery,
    head_sha: input.headSha ?? null,
    evaluated_at: (input.now ?? new Date()).toISOString(),
  };
}
