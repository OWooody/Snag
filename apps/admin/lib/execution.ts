import type { ExecuteDelivery, ForgeHost } from "@snag/shared";

export interface DeliveryPrerequisites {
  host: ForgeHost | null;
  hasForgeCredential: boolean;
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
  if (prerequisites.host === "origin" && delivery === "preview_confirm") {
    return [
      "Preview, then merge only works on GitHub. Choose PR only or merge directly to production for this Origin repository.",
    ];
  }
  const missing: string[] = [];
  if (!prerequisites.hasForgeCredential) {
    missing.push(
      prerequisites.host === "origin"
        ? "Add an Origin app so Snag can read checks and merge pull requests."
        : "Add a GitHub token so Snag can read checks and merge PRs.",
    );
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
