/**
 * Delivery step for execute-mode requests whose PR passed policy. Run by the
 * cron-triggered delivery worker, one call per request:
 *
 *   preview_confirm: wait for a preview deployment → awaiting_confirmation →
 *                    (requester taps "Looks right") → wait for CI → merge
 *   auto_merge:      wait for CI → merge
 *
 * Any new commit on the PR re-runs the diff rules and voids an earlier
 * confirmation. Anything unexpected hands the PR to a developer
 * (awaiting_review) instead of merging.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ForgeError,
  forgeHostFromRepoUrl,
  hostLabel,
  parseForgePullRequestUrl,
  sameRepo,
  type PullRequestInfo,
} from "./forge.ts";
import {
  claimTransition,
  evaluateDiff,
  type LifecycleRow,
  type PolicyDecisionRecord,
} from "./lifecycle.ts";
import { type ForgeConnection, type ProjectRow, projectForge } from "./projects.ts";

export const PREVIEW_TIMEOUT_MS = 30 * 60 * 1000;
export const CI_TIMEOUT_MS = 60 * 60 * 1000;

export interface DeliveryRunState {
  /** Projects that already merged a PR in this run; merges are serialized per project. */
  mergedProjects: Set<string>;
}

export async function advanceDelivery(
  service: SupabaseClient,
  project: ProjectRow,
  row: LifecycleRow,
  state: DeliveryRunState,
  now = Date.now(),
  deps: { forge?: ForgeConnection | null } = {},
): Promise<void> {
  let forge: ForgeConnection | null;
  if (deps.forge !== undefined) {
    forge = deps.forge;
  } else {
    try {
      forge = await projectForge(project);
    } catch (error) {
      console.error(`snag delivery forge auth failed request=${row.id}:`, error);
      forge = null;
    }
  }
  const prRef = row.pr_url ? parseForgePullRequestUrl(row.pr_url) : null;
  if (!forge || !prRef || !sameRepo(prRef, forge.host, forge.repo)) {
    if (row.status !== "awaiting_review") {
      const label = forge
        ? hostLabel(forge.host)
        : hostLabel(forgeHostFromRepoUrl(project.repo_url) ?? "github");
      await handOff(service, row, `Snag cannot reach the pull request on ${label}.`);
    }
    return;
  }

  let pr: PullRequestInfo;
  try {
    pr = await forge.client.getPullRequest(forge.repo, prRef.number);
  } catch (error) {
    console.error(`snag delivery PR lookup failed request=${row.id}:`, error);
    return;
  }

  if (pr.merged) {
    await claimTransition(service, row, {
      status: "merged",
      merged_at: new Date(now).toISOString(),
      merge_commit_sha: pr.mergeCommitSha,
    });
    return;
  }
  if (pr.state === "closed") {
    await claimTransition(service, row, {
      status: "error",
      error: "The pull request was closed without merging.",
    });
    return;
  }

  if (row.status === "awaiting_review" || row.phase !== "delivering") return;

  const record: PolicyDecisionRecord = row.policy_decision ?? {};
  const delivery = record.diff?.delivery;
  if (delivery !== "preview_confirm" && delivery !== "auto_merge") {
    await handOff(service, row, "Delivery setting changed; a developer needs to merge this PR.");
    return;
  }

  if (record.diff?.head_sha !== pr.headSha) {
    const rechecked = await recheckNewCommits(service, project, forge, row, record, pr, now);
    if (!rechecked) return;
  }

  if (delivery === "preview_confirm" && !row.confirmed_at) {
    if (row.status === "awaiting_confirmation") return;
    const previewUrl = await forge.client.findPreviewUrl(forge.repo, pr.headSha)
      .catch((error) => {
        console.warn(`snag preview lookup failed request=${row.id}:`, error);
        return null;
      });
    if (previewUrl) {
      await claimTransition(service, row, {
        status: "awaiting_confirmation",
        preview_url: previewUrl,
      });
    } else if (elapsedSince(row.phase_started_at, now) > PREVIEW_TIMEOUT_MS) {
      await handOff(service, row, "No preview deployment was found for this pull request.");
    }
    return;
  }

  await tryMerge(service, project, forge, row, pr, state, now);
}

async function recheckNewCommits(
  service: SupabaseClient,
  project: ProjectRow,
  forge: ForgeConnection,
  row: LifecycleRow,
  record: PolicyDecisionRecord,
  pr: PullRequestInfo,
  now: number,
): Promise<boolean> {
  const { decision, final } = await evaluateDiff(
    service,
    project,
    forge,
    row,
    pr.number,
    pr.headSha,
  );
  const nextRecord: PolicyDecisionRecord = { ...record, diff: decision, final_outcome: final };
  if (final !== "execute") {
    await claimTransition(service, row, {
      status: "awaiting_review",
      policy_decision: nextRecord,
      handoff_reason: "New commits on the pull request no longer pass the rules.",
    });
    return false;
  }
  return await claimTransition(service, row, {
    status: "running",
    policy_decision: nextRecord,
    preview_url: null,
    confirmed_at: null,
    phase_started_at: new Date(now).toISOString(),
  });
}

async function tryMerge(
  service: SupabaseClient,
  project: ProjectRow,
  forge: ForgeConnection,
  row: LifecycleRow,
  pr: PullRequestInfo,
  state: DeliveryRunState,
  now: number,
): Promise<void> {
  if (state.mergedProjects.has(project.id)) return;

  const waitingSince = row.confirmed_at ?? row.phase_started_at;
  const checks = await forge.client.getChecksState(forge.repo, pr.headSha);
  if (checks === "pending") {
    if (elapsedSince(waitingSince, now) > CI_TIMEOUT_MS) {
      await handOff(service, row, "CI did not finish within 60 minutes.");
    }
    return;
  }
  if (checks === "failure") {
    await handOff(service, row, "CI failed on the pull request.");
    return;
  }
  if (checks === "none") {
    await handOff(
      service,
      row,
      "The repository reports no CI checks for this pull request, so Snag will not merge it automatically.",
    );
    return;
  }
  if (pr.mergeable === null) return;
  if (pr.mergeable === false) {
    await handOff(service, row, "The pull request has merge conflicts.");
    return;
  }

  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await service
    .from("snag_requests")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .gte("merged_at", dayAgo)
    .eq("policy_decision->>final_outcome", "execute");
  if (countError) {
    console.error(`snag merge cap count failed project=${project.id}:`, countError);
    return;
  }
  if ((count ?? 0) >= project.auto_merge_daily_limit) {
    await handOff(service, row, "Daily automatic merge limit reached.");
    return;
  }

  // Claim before merging so a concurrent worker run cannot merge twice.
  if (!(await claimTransition(service, row, { status: "running" }))) return;
  state.mergedProjects.add(project.id);

  try {
    if (pr.draft) await forge.client.markReadyForReview(forge.repo, pr);
    const result = await forge.client.squashMerge(forge.repo, pr.number, {
      sha: pr.headSha,
      title: `${pr.title} (#${pr.number})`,
    });
    if (!result.merged) {
      await handOff(service, row, `${hostLabel(forge.host)} did not merge the pull request.`);
      return;
    }
    await claimTransition(service, row, {
      status: "merged",
      merged_at: new Date(now).toISOString(),
      merge_commit_sha: result.sha,
    });
  } catch (error) {
    console.error(`snag merge failed request=${row.id}:`, error);
    const refused = error instanceof ForgeError &&
      (error.status === 400 || error.status === 403 || error.status === 405 ||
        error.status === 409 || error.status === 422);
    const label = hostLabel(forge.host);
    await handOff(
      service,
      row,
      refused
        ? `${label} refused the merge (branch protection, conflicts, or token permissions).`
        : "Snag could not merge the pull request.",
    );
  }
}

async function handOff(
  service: SupabaseClient,
  row: LifecycleRow,
  reason: string,
): Promise<void> {
  await claimTransition(service, row, { status: "awaiting_review", handoff_reason: reason });
}

function elapsedSince(iso: string | null, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return now - new Date(iso).getTime();
}
