/**
 * Agent prompt fragments for the two-phase execute flow.
 * buildImplementationPrompt is mirrored in packages/shared/src/execute-policy.ts
 * (the admin panel sends it when a developer approves a plan) — keep in sync.
 */

import { PLAN_FLAGS, SNAG_PLAN_HEADING } from "./plan_block.ts";
import { requesterQuestionsFormatLines } from "./requester_questions.ts";

const SAME_QUESTION_FORMAT =
  "Use the same format as before: Markdown bullets plus the fenced JSON block.";

/**
 * The requester can preview a plan on the live page before approving it.
 * Ops are validated by preview_ops.ts; keep the two lists in sync.
 */
function previewInstructions(): string[] {
  return [
    '   - preview (optional): page edits the requester\'s browser can apply temporarily to show roughly what the change looks like, e.g. [{"op": "css", "selector": "[data-testid=save]", "style": {"background": "#2563eb", "color": "#fff"}}].',
    '     Allowed ops: css (selector + style properties), text (selector + plain "text"), hide (selector), move (selector + "before" or "after" a sibling selector), attr (selector + "name" of placeholder, title, aria-label, or alt + "value").',
    "     Use selectors that match the running page (data-testid, ids, or the selectors from Selected elements). No url() values.",
    "     Omit preview (or use null) when the change involves logic, data, new pages, or new components.",
  ];
}

/**
 * The agent can only work in the project's repository, so requests about
 * other code must come back as an explanation rather than a plan.
 */
export function scopeInstructions(
  followupsEnabled: boolean,
  executeMode: boolean,
): string[] {
  const lines = [
    "You can only change this repository. If the request is about code that is not in it (another service or repository, a third-party library, or the Snag tool used to file this request), do not plan or make a change.",
    followupsEnabled
      ? '- Explain this under "## Questions for requester" in plain language, say where the change likely belongs, and ask whether they meant something in this app instead.'
      : '- Explain this under "## Notes for developers" and say where the change likely belongs.',
  ];
  if (executeMode) {
    lines.push(`- Omit the "${SNAG_PLAN_HEADING}" block.`);
  }
  return lines;
}

export function planningInstructions(
  followupsEnabled: boolean,
  planReviewEnabled = false,
): string[] {
  const lines = [
    "1. PLANNING PHASE ONLY: locate the exact code behind the request and write a short plan (files, edits, risks).",
    "   Do NOT edit files, commit, push, or open a pull request yet. Snag decides whether implementation starts automatically or waits for a developer.",
    "2. Respect existing conventions in the repository.",
    "3. Keep the planned change minimal — no drive-by refactors.",
  ];

  if (followupsEnabled) {
    lines.push(
      "",
      "When listing open questions, separate them in your summary as follows:",
      "- Put product/UX/scope decisions only the requester can answer FIRST under exactly this heading:",
      "  ## Questions for requester",
      "  (copy, intent, which variant, edge-case preference). Omit this heading entirely if there are none.",
      ...requesterQuestionsFormatLines(),
      "- Put technical open questions under:",
      "  ## Notes for developers",
      "  (architecture, data model, risks, implementation). Do not put these in the requester section.",
    );
  } else {
    lines.push(
      "",
      'List any open questions under "## Notes for developers".',
    );
  }

  lines.push(
    "",
    followupsEnabled
      ? `4. Once you have no questions left for the requester, end your summary with exactly this heading and a fenced JSON block:`
      : `4. End your summary with exactly this heading and a fenced JSON block:`,
    `   ${SNAG_PLAN_HEADING}`,
    "   ```json",
    '   {"files": ["path/to/file.tsx"], "risk": "low", "flags": [], "summary": "One sentence describing the change", "changes": ["Make the Save button blue"]}',
    "   ```",
    "   - files: every repository-relative path you expect to create, modify, or delete.",
    "   - risk: low, medium, or high.",
    `   - flags: every one that applies from: ${PLAN_FLAGS.join(", ")}.`,
    "   - changes: 1 to 5 short bullets describing what the requester will see change, in plain language with no file names or code.",
  );
  if (planReviewEnabled) {
    lines.push(...previewInstructions());
  }
  if (followupsEnabled) {
    lines.push("   Omit this block while you still have questions for the requester.");
  }
  return lines;
}

export function planningReplyWrapper(reply: string): string {
  return [
    "The original requester answered your open questions via Snag:",
    "",
    reply,
    "",
    "Continue planning with this clarification. Do not edit files yet.",
    'If you are still blocked on product/UX/scope decisions, list remaining questions under "## Questions for requester" at the top of your summary.',
    SAME_QUESTION_FORMAT,
    'Put technical notes under "## Notes for developers".',
    `If no further requester questions remain, omit the requester heading and end your summary with the "${SNAG_PLAN_HEADING}" JSON block as instructed earlier.`,
  ].join("\n");
}

export function planAdjustmentWrapper(feedback: string): string {
  return [
    "The original requester reviewed your plan via Snag and wants it changed:",
    "",
    feedback,
    "",
    "Revise the plan to match. Do not edit files yet.",
    'If the feedback leaves a product/UX/scope decision open, list it under "## Questions for requester".',
    SAME_QUESTION_FORMAT,
    'Put technical notes under "## Notes for developers".',
    `Otherwise end your summary with an updated "${SNAG_PLAN_HEADING}" JSON block as instructed earlier, including "changes" (and "preview" when the change can be previewed).`,
  ].join("\n");
}

export function implementingReplyWrapper(reply: string): string {
  return [
    "The original requester answered your open questions via Snag:",
    "",
    reply,
    "",
    "Continue implementing with this clarification. Stay within the files in your Snag plan, and do not merge the pull request.",
    'If you are still blocked on product/UX/scope decisions, list remaining questions under "## Questions for requester" at the top of your summary.',
    SAME_QUESTION_FORMAT,
    'Put technical notes under "## Notes for developers".',
  ].join("\n");
}

export function buildImplementationPrompt(options: {
  baseRef: string;
  approvedBy: "policy" | "developer";
  developerNote?: string | null;
}): string {
  const lines = [
    options.approvedBy === "developer"
      ? "A developer approved your plan via Snag. Implement it now."
      : "Snag's rules approved your plan. Implement it now.",
    "",
    '- Only change the files listed in your "## Snag plan" block. If you must touch other files, explain why under "## Notes for developers".',
    `- Commit, push your branch, and open a pull request against \`${options.baseRef}\`.`,
    "- Do NOT merge the pull request. Snag decides whether and when it is merged.",
    "- Do not modify CI configuration, existing tests, or dependency manifests unless your plan listed them.",
    '- If you hit a product question only the requester can answer, stop and list it under "## Questions for requester".',
    '- Put technical notes under "## Notes for developers".',
  ];
  const note = options.developerNote?.trim();
  if (note) {
    lines.push("", "Developer note:", note);
  }
  return lines.join("\n");
}

export function previewFeedbackPrompt(feedback: string): string {
  return [
    "The requester checked the preview deployment of your pull request and says it is not right:",
    "",
    feedback,
    "",
    "Update the same branch and pull request to address this. Do NOT merge.",
    'Stay within the files in your Snag plan; if you must touch others, explain why under "## Notes for developers".',
    'If the feedback raises a product question, list it under "## Questions for requester".',
  ].join("\n");
}
