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

/** One question the requester can answer by tapping a choice or typing. */
export interface RequesterQuestion {
  id: string;
  text: string;
  /** Empty for open-ended questions. */
  choices: string[];
  /** Offer a free-text answer next to the choices. Always true when `choices` is empty. */
  allow_other: boolean;
}

const MAX_STRUCTURED_QUESTIONS = 8;
const MAX_QUESTION_CHOICES = 6;
const MAX_QUESTION_TEXT = 500;
const MAX_CHOICE_TEXT = 200;
const QUESTIONS_FENCE = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/;
const QUESTIONS_FENCE_GLOBAL = /```(?:json)?\s*\n[\s\S]*?\n\s*```/g;

/**
 * Parse the fenced JSON block inside "## Questions for requester".
 * Returns null when the block is missing or anything in it is invalid, so
 * callers fall back to showing the Markdown questions.
 * Mirrored in packages/react/src/requester-questions.ts.
 */
export function parseRequesterQuestions(
  summary: string | null | undefined,
): RequesterQuestion[] | null {
  const section = extractRequesterQuestionsSection(summary);
  if (!section) return null;
  const fence = section.match(QUESTIONS_FENCE);
  if (!fence) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fence[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STRUCTURED_QUESTIONS) {
    return null;
  }

  const questions: RequesterQuestion[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") return null;
    const value = item as Record<string, unknown>;
    const text = typeof value.text === "string" ? value.text.trim() : "";
    if (!text || text.length > MAX_QUESTION_TEXT) return null;

    const rawChoices = value.choices ?? [];
    if (!Array.isArray(rawChoices) || rawChoices.length > MAX_QUESTION_CHOICES) return null;
    const choices: string[] = [];
    for (const choice of rawChoices) {
      if (typeof choice !== "string") return null;
      const trimmed = choice.trim();
      if (!trimmed || trimmed.length > MAX_CHOICE_TEXT) return null;
      if (!choices.includes(trimmed)) choices.push(trimmed);
    }

    const id =
      typeof value.id === "string" && value.id.trim() ? value.id.trim().slice(0, 40) : `q${index + 1}`;
    questions.push({
      id: questions.some((question) => question.id === id) ? `q${index + 1}` : id,
      text,
      choices,
      allow_other: choices.length === 0 || value.allow_other !== false,
    });
  }
  return questions;
}

/** Remove fenced JSON blocks from the requester-questions section so Markdown views never show them. */
export function stripRequesterQuestionsJson(summary: string): string {
  const headingIndex = summary.indexOf(REQUESTER_QUESTIONS_HEADING);
  if (headingIndex < 0) return summary;
  const start = headingIndex + REQUESTER_QUESTIONS_HEADING.length;
  const after = summary.slice(start);
  const nextHeading = after.match(/\n##\s/);
  const end = nextHeading ? start + (nextHeading.index ?? 0) : summary.length;
  const section = summary.slice(start, end).replace(QUESTIONS_FENCE_GLOBAL, "").replace(/\n{3,}/g, "\n\n");
  return `${summary.slice(0, start)}${section.trimEnd()}${end < summary.length ? "\n" : ""}${summary.slice(end)}`;
}

/** Reply text sent to the agent for structured answers. Unanswered questions say so. */
export function formatRequesterAnswers(
  questions: RequesterQuestion[],
  answers: Record<string, string | undefined>,
): string {
  return questions
    .map((question) => {
      const answer = answers[question.id]?.trim();
      return `Q: ${question.text}\nA: ${answer || "(no preference)"}`;
    })
    .join("\n\n");
}
