/**
 * Execute-mode request lifecycle. Called when an agent run reaches a terminal
 * state (from the Cursor webhook or the relay's polling fallback).
 *
 *   planning      → needs_input | awaiting_approval | implementing
 *   implementing  → needs_input | awaiting_review | finished | delivering
 *   delivering    → handled by the delivery worker
 *
 * Every transition goes through claimTransition(), an optimistic lock on
 * snag_requests.lifecycle_version, so concurrent handlers act exactly once.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type AgentProvider, userFacingLaunchError } from "./agent_provider.ts";
import { buildImplementationPrompt } from "./execute_prompts.ts";
import { GitHubError, parsePullRequestUrl } from "./github.ts";
import { parseSnagPlan, type SnagPlan } from "./plan_block.ts";
import {
  evaluatePolicy,
  type PolicyOutcome,
  type PolicyStageDecision,
  strictestOutcome,
} from "./policy.ts";
import {
  loadPolicyRules,
  type ProjectRow,
  projectGitHub,
  projectSettings,
} from "./projects.ts";
import {
  mapTerminalRequestStatus,
  summaryHasRequesterQuestions,
} from "./requester_questions.ts";
import { isTrustedRequester } from "./requester_token.ts";

export const REQUEST_LIFECYCLE_COLUMNS =
  "id, project_id, prompt, status, phase, phase_started_at, lifecycle_version, agent_id, agent_url, branch_name, pr_url, preview_url, handoff_reason, summary, plan, plan_summary, policy_decision, requester, requester_verified, requester_ip, approved_at, confirmed_at, merged_at, updated_at";

export interface PolicyDecisionRecord {
  plan?: PolicyStageDecision;
  diff?: PolicyStageDecision;
  final_outcome?: PolicyOutcome;
  note?: string;
}

export interface LifecycleRow {
  id: string;
  project_id: string;
  prompt: string;
  status: string;
  phase: "planning" | "implementing" | "delivering" | null;
  phase_started_at: string | null;
  lifecycle_version: number;
  agent_id: string | null;
  agent_url: string | null;
  branch_name: string | null;
  pr_url: string | null;
  preview_url: string | null;
  handoff_reason: string | null;
  summary: string | null;
  plan: SnagPlan | null;
  plan_summary: string | null;
  policy_decision: PolicyDecisionRecord | null;
  requester: string | null;
  requester_verified: boolean;
  requester_ip: string | null;
  approved_at: string | null;
  confirmed_at: string | null;
  merged_at: string | null;
  updated_at: string;
}

export interface AgentTerminalResult {
  status: "finished" | "error";
  summary: string | null;
  url: string | null;
  branchName: string | null;
  prUrl: string | null;
}

/** A finished status that still carries the summary Snag handed back is stale for this long. */
const STALE_HANDOFF_MS = 10 * 60 * 1000;

/**
 * Apply `update` only if nobody else transitioned the row since it was read.
 * Mutates `row` on success so callers can keep using it.
 */
export async function claimTransition(
  service: SupabaseClient,
  row: LifecycleRow,
  update: Record<string, unknown>,
): Promise<boolean> {
  const nextVersion = row.lifecycle_version + 1;
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("snag_requests")
    .update({ ...update, lifecycle_version: nextVersion, updated_at: now })
    .eq("id", row.id)
    .eq("lifecycle_version", row.lifecycle_version)
    .select("id");
  if (error) {
    console.error(`snag transition failed request=${row.id}:`, error);
    return false;
  }
  if (!data || data.length === 0) return false;
  Object.assign(row, update, { lifecycle_version: nextVersion, updated_at: now });
  return true;
}

function requesterContext(row: LifecycleRow, project: ProjectRow) {
  return {
    id: row.requester,
    verified: row.requester_verified,
    trusted: isTrustedRequester(
      row.requester,
      row.requester_verified,
      project.trusted_requesters,
    ),
  };
}

export async function handleAgentTerminal(
  ctx: { service: SupabaseClient; provider: AgentProvider; project: ProjectRow },
  row: LifecycleRow,
  result: AgentTerminalResult,
): Promise<void> {
  if (row.status !== "queued" && row.status !== "running") return;

  const base: Record<string, unknown> = {};
  if (result.url) base.agent_url = result.url;
  if (result.branchName) base.branch_name = result.branchName;
  if (result.prUrl) base.pr_url = result.prUrl;
  if (result.summary) base.summary = result.summary;

  if (result.status === "error") {
    await claimTransition(ctx.service, row, {
      ...base,
      status: "error",
      error: "Agent run failed",
    });
    return;
  }

  const settings = projectSettings(ctx.project);
  const summary = result.summary ?? row.summary;

  if (!row.phase) {
    await claimTransition(ctx.service, row, {
      ...base,
      status: mapTerminalRequestStatus("finished", summary, settings.followupsEnabled),
    });
    return;
  }

  if (isStaleHandoff(row, summary)) return;

  if (settings.followupsEnabled && summaryHasRequesterQuestions(summary)) {
    await claimTransition(ctx.service, row, { ...base, status: "needs_input" });
    return;
  }

  if (row.phase === "planning") {
    await finishPlanning(ctx, row, base, summary);
  } else if (row.phase === "implementing") {
    await finishImplementation(ctx, row, base, summary);
  } else {
    await claimTransition(ctx.service, row, base);
  }
}

function isStaleHandoff(row: LifecycleRow, summary: string | null): boolean {
  if (!summary || !row.plan_summary || summary !== row.plan_summary) return false;
  const startedAt = row.phase_started_at ? new Date(row.phase_started_at).getTime() : 0;
  return Date.now() - startedAt < STALE_HANDOFF_MS;
}

async function finishPlanning(
  ctx: { service: SupabaseClient; provider: AgentProvider; project: ProjectRow },
  row: LifecycleRow,
  base: Record<string, unknown>,
  summary: string | null,
): Promise<void> {
  const { project } = ctx;
  const settings = projectSettings(project);
  const plan = parseSnagPlan(summary);
  const github = await projectGitHub(project);

  let editedDuringPlanning = false;
  const branch = (base.branch_name as string | undefined) ?? row.branch_name;
  if (github && branch && branch !== project.repo_ref) {
    try {
      editedDuringPlanning = await github.client.branchIsAhead(
        github.repo,
        project.repo_ref,
        branch,
      );
    } catch (error) {
      console.warn(`snag planning compare failed request=${row.id}:`, error);
    }
  }

  const decision = evaluatePolicy({
    stage: "plan",
    files: (plan?.files ?? []).map((path) => ({ path, status: "unknown" as const })),
    linesChanged: null,
    risk: plan?.risk ?? null,
    flags: plan?.flags ?? [],
    planFiles: null,
    planMissing: !plan,
    editedDuringPlanning,
    requester: requesterContext(row, project),
    rules: await loadPolicyRules(ctx.service, project),
    defaultOutcome: settings.defaultOutcome,
    delivery: settings.delivery,
    projectShadow: settings.shadow,
  });

  const record: PolicyDecisionRecord = { plan: decision };
  const planFields = {
    plan,
    plan_summary: summary,
    policy_decision: record,
  };

  if (decision.outcome === "review_before_execution") {
    await claimTransition(ctx.service, row, {
      ...base,
      ...planFields,
      status: "awaiting_approval",
    });
    return;
  }

  const claimed = await claimTransition(ctx.service, row, {
    ...base,
    ...planFields,
    status: "running",
    phase: "implementing",
    phase_started_at: new Date().toISOString(),
  });
  if (!claimed || !row.agent_id) return;

  try {
    await ctx.provider.followUp(
      row.agent_id,
      buildImplementationPrompt({ baseRef: project.repo_ref, approvedBy: "policy" }),
    );
  } catch (error) {
    console.error(`snag implementation follow-up failed request=${row.id}:`, error);
    await claimTransition(ctx.service, row, {
      status: "error",
      error: userFacingLaunchError(error),
    });
  }
}

async function finishImplementation(
  ctx: { service: SupabaseClient; provider: AgentProvider; project: ProjectRow },
  row: LifecycleRow,
  base: Record<string, unknown>,
  summary: string | null,
): Promise<void> {
  const { project } = ctx;
  const settings = projectSettings(project);
  const record: PolicyDecisionRecord = { ...(row.policy_decision ?? {}) };

  const github = await projectGitHub(project);
  if (!github) {
    const final = planStageOutcome(row);
    await claimTransition(ctx.service, row, {
      ...base,
      status: final === "execute" && settings.delivery === "pr_only"
        ? "finished"
        : "awaiting_review",
      policy_decision: {
        ...record,
        final_outcome: final,
        note: "GitHub token not configured; the PR diff was not checked.",
      },
    });
    return;
  }

  try {
    const prNumber = await resolvePullRequest(github, project, row, base, summary);
    if (prNumber === null) {
      await claimTransition(ctx.service, row, {
        ...base,
        status: "awaiting_review",
        handoff_reason: "The agent finished without opening a pull request.",
        policy_decision: { ...record, final_outcome: "review_before_merge" },
      });
      return;
    }

    const pr = await github.client.getPullRequest(github.repo, prNumber);
    const { decision: diffDecision, final } = await evaluateDiff(
      ctx.service,
      project,
      github,
      row,
      prNumber,
      pr.headSha,
    );
    const nextRecord: PolicyDecisionRecord = {
      ...record,
      diff: diffDecision,
      final_outcome: final,
    };

    if (final !== "execute") {
      await claimTransition(ctx.service, row, {
        ...base,
        status: "awaiting_review",
        policy_decision: nextRecord,
      });
    } else if (diffDecision.delivery === "pr_only") {
      await claimTransition(ctx.service, row, {
        ...base,
        status: "finished",
        policy_decision: nextRecord,
      });
    } else {
      await claimTransition(ctx.service, row, {
        ...base,
        status: "running",
        phase: "delivering",
        phase_started_at: new Date().toISOString(),
        policy_decision: nextRecord,
      });
    }
  } catch (error) {
    console.error(`snag diff check failed request=${row.id}:`, error);
    await claimTransition(ctx.service, row, {
      ...base,
      status: "awaiting_review",
      handoff_reason: error instanceof GitHubError
        ? "Snag could not read the pull request from GitHub."
        : "Snag could not check the pull request.",
      policy_decision: { ...record, final_outcome: "review_before_merge" },
    });
  }
}

/**
 * What the plan stage allows once code exists: a developer-approved plan (or a
 * plan that waited for approval) still needs a developer to review the PR.
 */
function planStageOutcome(row: LifecycleRow): PolicyOutcome {
  if (row.approved_at) return "review_before_merge";
  const outcome = row.policy_decision?.plan?.outcome ?? "review_before_merge";
  return outcome === "review_before_execution" ? "review_before_merge" : outcome;
}

/** Evaluate the rules against the PR's real diff and combine with the plan stage. */
export async function evaluateDiff(
  service: SupabaseClient,
  project: ProjectRow,
  github: NonNullable<Awaited<ReturnType<typeof projectGitHub>>>,
  row: LifecycleRow,
  prNumber: number,
  headSha: string,
): Promise<{ decision: PolicyStageDecision; final: PolicyOutcome }> {
  const settings = projectSettings(project);
  const diff = await github.client.getPullRequestDiff(github.repo, prNumber);
  const decision = evaluatePolicy({
    stage: "diff",
    files: diff.files,
    linesChanged: diff.linesChanged,
    risk: row.plan?.risk ?? null,
    flags: row.plan?.flags ?? [],
    planFiles: row.plan?.files ?? null,
    planMissing: false,
    editedDuringPlanning: row.policy_decision?.plan?.matched.some(
      (rule) => rule.id === "builtin:edited_during_planning",
    ) ?? false,
    requester: requesterContext(row, project),
    rules: await loadPolicyRules(service, project),
    defaultOutcome: settings.defaultOutcome,
    delivery: settings.delivery,
    projectShadow: settings.shadow,
    headSha,
  });
  return {
    decision,
    final: strictestOutcome(planStageOutcome(row), decision.outcome),
  };
}

async function resolvePullRequest(
  github: NonNullable<Awaited<ReturnType<typeof projectGitHub>>>,
  project: ProjectRow,
  row: LifecycleRow,
  base: Record<string, unknown>,
  summary: string | null,
): Promise<number | null> {
  const prUrl = (base.pr_url as string | undefined) ?? row.pr_url;
  if (prUrl) {
    const parsed = parsePullRequestUrl(prUrl);
    if (
      parsed &&
      parsed.owner.toLowerCase() === github.repo.owner.toLowerCase() &&
      parsed.repo.toLowerCase() === github.repo.repo.toLowerCase()
    ) {
      return parsed.number;
    }
  }

  const branch = (base.branch_name as string | undefined) ?? row.branch_name;
  if (!branch || branch === project.repo_ref) return null;

  const existing = await github.client.findOpenPullRequest(
    github.repo,
    branch,
    project.repo_ref,
  );
  if (existing !== null) {
    base.pr_url = `https://github.com/${github.repo.owner}/${github.repo.repo}/pull/${existing}`;
    return existing;
  }

  if (!(await github.client.branchIsAhead(github.repo, project.repo_ref, branch))) {
    return null;
  }

  const created = await github.client.createPullRequest(github.repo, {
    head: branch,
    base: project.repo_ref,
    title: `Snag: ${row.prompt.slice(0, 72)}`,
    body: [
      `Opened by Snag for request \`${row.id}\`.`,
      "",
      row.plan?.summary ?? "",
      "",
      summary ? summary.slice(0, 4000) : "",
    ].join("\n").trim(),
  });
  base.pr_url = created.url;
  return created.number;
}
