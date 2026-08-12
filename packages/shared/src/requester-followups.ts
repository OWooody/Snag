export const DEFAULT_REQUESTER_FOLLOWUPS_ENABLED = true;

export const REQUESTER_QUESTIONS_HEADING = "## Questions for requester";

/**
 * Resolve effective requester-followups flag: project override, else org, else default.
 */
export function resolveEffectiveRequesterFollowups(
  projectEnabled: boolean | null | undefined,
  orgEnabled: boolean | null | undefined,
): boolean {
  if (typeof projectEnabled === "boolean") return projectEnabled;
  if (typeof orgEnabled === "boolean") return orgEnabled;
  return DEFAULT_REQUESTER_FOLLOWUPS_ENABLED;
}

/**
 * Body of the "## Questions for requester" section (heading stripped), or null
 * when the heading is missing / the section is empty.
 */
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

/**
 * True when the agent summary includes a non-empty "## Questions for requester" section.
 */
export function summaryHasRequesterQuestions(summary: string | null | undefined): boolean {
  return extractRequesterQuestionsSection(summary) != null;
}
