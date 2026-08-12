/**
 * Detect "## Questions for requester" sections in agent summaries.
 * Mirrored in packages/shared/src/requester-followups.ts — keep in sync
 * (Deno edge functions cannot import the npm package).
 */

export const REQUESTER_QUESTIONS_HEADING = "## Questions for requester";

/**
 * Body of the "## Questions for requester" section (heading stripped), or null
 * when the heading is missing / the section is empty.
 * Mirrored in packages/shared/src/requester-followups.ts.
 */
export function extractRequesterQuestionsSection(
  summary: string | null | undefined,
): string | null {
  if (!summary) return null;
  const headingIndex = summary.indexOf(REQUESTER_QUESTIONS_HEADING);
  if (headingIndex < 0) return null;

  const afterHeading = summary.slice(
    headingIndex + REQUESTER_QUESTIONS_HEADING.length,
  );
  const nextHeadingMatch = afterHeading.match(/\n##\s/);
  const sectionBody = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;
  const trimmed = sectionBody.trim();
  if (!trimmed || trimmed.replace(/[\s#*-]/g, "").length === 0) return null;
  return trimmed;
}

export function summaryHasRequesterQuestions(
  summary: string | null | undefined,
): boolean {
  return extractRequesterQuestionsSection(summary) != null;
}

export type TerminalRequestStatus = "finished" | "needs_input" | "error";

/**
 * Map a Cursor terminal status + summary into a Snag request status.
 * When follow-ups are enabled and the summary has requester questions,
 * use needs_input instead of finished.
 */
export function mapTerminalRequestStatus(
  cursorMapped: "queued" | "running" | "finished" | "error",
  summary: string | null | undefined,
  followupsEnabled: boolean,
): "queued" | "running" | "finished" | "error" | "needs_input" {
  if (cursorMapped === "queued") return "running";
  if (cursorMapped !== "finished") return cursorMapped;
  if (followupsEnabled && summaryHasRequesterQuestions(summary)) {
    return "needs_input";
  }
  return "finished";
}

export function resolveEffectiveRequesterFollowups(
  projectEnabled: boolean | null | undefined,
  orgEnabled: boolean | null | undefined,
): boolean {
  if (typeof projectEnabled === "boolean") return projectEnabled;
  if (typeof orgEnabled === "boolean") return orgEnabled;
  return true;
}
