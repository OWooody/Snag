/**
 * Short, requester-facing description of where an in-progress execute-mode
 * request is. Returned by the relay as `stage_label`; null when the status
 * label already says enough.
 */

import type { LifecycleRow, PolicyDecisionRecord } from "./lifecycle.ts";

export type RequestStageCode =
  | "planning"
  | "building"
  | "waiting_preview"
  | "waiting_checks";

export function requestStageCode(
  row: Pick<LifecycleRow, "status" | "phase" | "confirmed_at" | "policy_decision">,
): RequestStageCode | null {
  if (row.status !== "running") return null;
  switch (row.phase) {
    case "planning":
      return "planning";
    case "implementing":
      return "building";
    case "delivering": {
      const delivery = row.policy_decision?.diff?.delivery;
      if (delivery === "preview_confirm" && !row.confirmed_at) return "waiting_preview";
      return "waiting_checks";
    }
    default:
      return null;
  }
}

export function requestStageLabel(
  row: Pick<LifecycleRow, "status" | "phase" | "confirmed_at" | "policy_decision">,
): string | null {
  if (row.status !== "running") return null;
  switch (row.phase) {
    case "planning":
      return "Planning";
    case "implementing":
      return "Building";
    case "delivering": {
      const delivery = row.policy_decision?.diff?.delivery;
      if (delivery === "preview_confirm" && !row.confirmed_at) return "Waiting for preview";
      return "Waiting for checks";
    }
    default:
      return null;
  }
}

const EXACT_HANDOFF_CODES: Record<string, string> = {
  "New commits on the pull request no longer pass the rules.": "rules_changed",
  "The agent finished without opening a pull request.": "no_pr",
  "No preview deployment was found for this pull request.": "no_preview",
  "CI did not finish within 60 minutes.": "ci_timeout",
  "CI failed on the pull request.": "ci_failed",
  "The repository reports no CI checks for this pull request, so Snag will not merge it automatically.":
    "no_checks",
  "The pull request has merge conflicts.": "conflicts",
  "Daily automatic merge limit reached.": "daily_limit",
  "Snag could not merge the pull request.": "merge_failed",
  "Delivery setting changed; a developer needs to merge this PR.": "delivery_changed",
  "Snag could not check the pull request.": "check_failed",
};

/** Stable code next to the English handoff_reason so the overlay can translate it. */
export function handoffCodeFromReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason in EXACT_HANDOFF_CODES) return EXACT_HANDOFF_CODES[reason];
  if (/^Snag cannot reach the pull request on /.test(reason)) return "unreachable";
  if (/^Snag could not authenticate to /.test(reason)) return "auth_failed";
  if (/ did not merge the pull request\.$/.test(reason)) return "host_did_not_merge";
  if (/ refused the merge \(branch protection, conflicts, or token permissions\)\.$/.test(reason)) {
    return "host_refused";
  }
  if (/^Snag could not read the pull request from /.test(reason)) return "read_failed";
  return null;
}

export function blockedRulesFromDecision(
  record: PolicyDecisionRecord | null | undefined,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const stage of [record?.plan, record?.diff]) {
    for (const rule of stage?.matched ?? []) {
      if (rule.shadow || rule.kind !== "block" || seen.has(rule.name)) continue;
      seen.add(rule.name);
      names.push(rule.name);
    }
  }
  return names;
}

export function rejectionReasonForRow(
  row: Pick<LifecycleRow, "status" | "policy_decision">,
): "policy_block" | "developer" | null {
  if (row.status !== "rejected") return null;
  if (
    row.policy_decision?.final_outcome === "blocked" ||
    blockedRulesFromDecision(row.policy_decision).length > 0
  ) {
    return "policy_block";
  }
  return "developer";
}
