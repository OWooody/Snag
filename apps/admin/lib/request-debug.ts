import { parsePreviewOps, rawSnagPlanBlock } from "@snag/shared";

export interface ProposedPreview {
  ops: unknown[];
  /** False when Snag dropped the preview, so the requester never saw it. */
  accepted: boolean;
  /** Indexes of ops that fail validation on their own. */
  rejected: number[];
}

/** The preview the agent wrote in its latest plan block, checked op by op. */
export function inspectProposedPreview(summary: string | null): ProposedPreview | null {
  const preview = rawSnagPlanBlock(summary)?.preview;
  if (preview === undefined || preview === null) return null;
  const ops = Array.isArray(preview) ? preview : [preview];
  return {
    ops,
    accepted: parsePreviewOps(preview) !== null,
    rejected: ops.flatMap((op, index) => (parsePreviewOps([op]) ? [] : [index])),
  };
}

/**
 * Header and first instruction line of each prompt Snag wraps around a
 * requester's words; must match supabase/functions/_shared/execute_prompts.ts.
 */
const REQUESTER_WRAPPERS: { header: string; trailer: string; label: string }[] = [
  {
    header: "The original requester answered your open questions via Snag:",
    trailer: "Continue planning with this clarification.",
    label: "Requester answered questions",
  },
  {
    header: "The original requester answered your open questions via Snag:",
    trailer: "Continue implementing with this clarification.",
    label: "Requester answered questions",
  },
  {
    header: "The original requester reviewed your plan via Snag and wants it changed:",
    trailer: "Revise the plan to match.",
    label: "Requester asked for plan changes",
  },
  {
    header:
      "The requester checked the preview deployment of your pull request and says it is not right:",
    trailer: "Update the same branch and pull request",
    label: "Requester rejected the preview",
  },
];

/** The requester's own words inside a prompt Snag sent the agent, if it is one. */
export function requesterReplyFromPrompt(text: string): { label: string; reply: string } | null {
  for (const { header, trailer, label } of REQUESTER_WRAPPERS) {
    if (!text.startsWith(header)) continue;
    const end = text.lastIndexOf(`\n\n${trailer}`);
    if (end < 0) continue;
    return { label, reply: text.slice(header.length, end).trim() };
  }
  return null;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
