/**
 * Local copy of packages/shared requester-question helpers.
 * @snag/shared is private; keep in sync with requester-followups.ts.
 */

export const REQUESTER_QUESTIONS_HEADING = "## Questions for requester";

/** Body of the requester-questions section, or null if missing/empty. */
export function extractRequesterQuestionsSection(
  summary: string | null | undefined,
): string | null {
  if (!summary) return null;
  const headingIndex = summary.indexOf(REQUESTER_QUESTIONS_HEADING);
  if (headingIndex < 0) return null;

  const afterHeading = summary.slice(headingIndex + REQUESTER_QUESTIONS_HEADING.length);
  const nextHeadingMatch = afterHeading.match(/\n##\s/);
  const sectionBody = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;
  const trimmed = sectionBody.trim();
  if (!trimmed || trimmed.replace(/[\s#*-]/g, "").length === 0) return null;
  return trimmed;
}

/** Summary text to show requesters — questions only when needs_input. */
export function displaySummaryForRequest(
  status: string,
  summary: string | null | undefined,
): string | null {
  if (!summary?.trim()) return null;
  if (status === "needs_input") {
    return extractRequesterQuestionsSection(summary) ?? summary.trim();
  }
  return summary.trim();
}
