/**
 * Context handed to a new agent when a requester continues an earlier request.
 * The earlier request keeps its own status; this text is only for the new run.
 */

const MAX_EARLIER_PROMPT = 500;
const MAX_EARLIER_SUMMARY = 1200;

export interface ContinuationParent {
  id: string;
  prompt: string;
  status: string;
  summary: string | null;
  pr_url: string | null;
  branch_name: string | null;
}

export function formatContinuationSection(parent: ContinuationParent): string {
  const lines = [
    "## Earlier request",
    "This change continues an earlier Snag request. That request may already be merged, finished, rejected, or still in progress.",
    "Start from the repository's default branch. Do not keep working on the earlier branch unless it is still the right place for this new change.",
    "Use the earlier request only as context. Implement the new change request below.",
    "",
    `Earlier request id: ${parent.id}`,
    `Earlier status: ${parent.status}`,
    `Earlier request: ${clip(parent.prompt.trim(), MAX_EARLIER_PROMPT)}`,
  ];
  if (parent.pr_url) lines.push(`Earlier pull request: ${parent.pr_url}`);
  if (parent.branch_name) lines.push(`Earlier branch: ${parent.branch_name}`);
  const summary = parent.summary?.trim();
  if (summary) {
    lines.push("", "What the earlier request produced:", clip(summary, MAX_EARLIER_SUMMARY));
  }
  return lines.join("\n");
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
