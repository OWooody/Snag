import type { ExecuteDelivery } from "@snag/shared";

export interface DeliveryPrerequisites {
  hasGitHubToken: boolean;
  hasRequesterSecret: boolean;
  trustedRequesterCount: number;
  acknowledged: boolean;
}

/** Human-readable reasons the delivery cannot be used yet; empty when it can. */
export function missingDeliveryPrerequisites(
  delivery: ExecuteDelivery,
  prerequisites: DeliveryPrerequisites,
): string[] {
  if (delivery === "pr_only") return [];
  const missing: string[] = [];
  if (!prerequisites.hasGitHubToken) {
    missing.push("Add a GitHub token so Snag can read checks and merge PRs.");
  }
  if (delivery === "auto_merge") {
    if (!prerequisites.hasRequesterSecret) {
      missing.push("Generate a requester signing secret so requester identities can be verified.");
    }
    if (prerequisites.trustedRequesterCount === 0) {
      missing.push("Add at least one trusted requester.");
    }
    if (!prerequisites.acknowledged) {
      missing.push("Acknowledge that auto-merge ships changes to production without code review.");
    }
  }
  return missing;
}
