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

export const SNAG_PLAN_HEADING = "## Snag plan";

const DEVELOPER_NOTES_HEADING = "## Notes for developers";

/** Remove one Markdown section, keeping any text before it and after the next heading. */
function stripHeadingSection(summary: string, heading: string): string {
  const headingIndex = summary.indexOf(heading);
  if (headingIndex < 0) return summary;
  const after = summary.slice(headingIndex + heading.length);
  const nextHeading = after.match(/\n##\s/);
  const rest = nextHeading ? after.slice(nextHeading.index) : "";
  return [summary.slice(0, headingIndex).trim(), rest.trim()].filter(Boolean).join("\n\n");
}

/** Remove the machine-readable "## Snag plan" section. Mirrors packages/shared. */
export function stripSnagPlanSection(summary: string): string {
  const headingIndex = summary.lastIndexOf(SNAG_PLAN_HEADING);
  if (headingIndex < 0) return summary;
  const after = summary.slice(headingIndex + SNAG_PLAN_HEADING.length);
  const nextHeading = after.match(/\n##\s/);
  const rest = nextHeading ? after.slice(nextHeading.index) : "";
  return [summary.slice(0, headingIndex).trim(), rest.trim()].filter(Boolean).join("\n\n");
}

/**
 * Summary text to show requesters.
 * needs_input shows the answer above the questions, and hides developer notes and the plan block.
 */
export function displaySummaryForRequest(
  status: string,
  summary: string | null | undefined,
): string | null {
  if (!summary?.trim()) return null;
  if (status === "needs_input") {
    const questions = extractRequesterQuestionsSection(summary);
    if (!questions) {
      const fallback = stripSnagPlanSection(summary.trim());
      return fallback || null;
    }
    const headingIndex = summary.indexOf(REQUESTER_QUESTIONS_HEADING);
    const before = headingIndex > 0 ? summary.slice(0, headingIndex) : "";
    const answer = stripHeadingSection(
      stripSnagPlanSection(before),
      DEVELOPER_NOTES_HEADING,
    ).trim();
    if (!answer) return questions;
    return `${answer}\n\n${REQUESTER_QUESTIONS_HEADING}\n\n${questions}`;
  }
  const display = stripSnagPlanSection(summary.trim());
  return display || null;
}
