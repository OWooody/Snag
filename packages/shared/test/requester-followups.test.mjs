import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUESTER_QUESTIONS_HEADING,
  extractRequesterQuestionsSection,
  formatRequesterAnswers,
  parseRequesterQuestions,
  resolveEffectiveRequesterFollowups,
  stripRequesterQuestionsJson,
  summaryHasRequesterQuestions,
} from "../dist/index.js";

test("summaryHasRequesterQuestions: empty / missing", () => {
  assert.equal(summaryHasRequesterQuestions(null), false);
  assert.equal(summaryHasRequesterQuestions(""), false);
  assert.equal(summaryHasRequesterQuestions("## Notes for developers\n- x"), false);
});

test("summaryHasRequesterQuestions: empty section is false", () => {
  const summary = `${REQUESTER_QUESTIONS_HEADING}\n\n## Notes for developers\n- tech`;
  assert.equal(summaryHasRequesterQuestions(summary), false);
  assert.equal(extractRequesterQuestionsSection(summary), null);
});

test("summaryHasRequesterQuestions: bullets are true", () => {
  const summary = [
    "Plan text above",
    REQUESTER_QUESTIONS_HEADING,
    "- Which shade of blue?",
    "- Keep it on home only?",
    "",
    "## Notes for developers",
    "- Check ThemeProvider",
  ].join("\n");
  assert.equal(summaryHasRequesterQuestions(summary), true);
  assert.equal(
    extractRequesterQuestionsSection(summary),
    "- Which shade of blue?\n- Keep it on home only?",
  );
});

test("summaryHasRequesterQuestions: section at end without next heading", () => {
  const summary = `${REQUESTER_QUESTIONS_HEADING}\nNeed copy for the empty state.`;
  assert.equal(summaryHasRequesterQuestions(summary), true);
  assert.equal(
    extractRequesterQuestionsSection(summary),
    "Need copy for the empty state.",
  );
});

const STRUCTURED_SUMMARY = [
  "The header color comes from ThemeProvider.",
  "",
  REQUESTER_QUESTIONS_HEADING,
  "- Which shade of blue?",
  "- Anything else?",
  "",
  "```json",
  '[{"id": "shade", "text": "Which shade of blue?", "choices": ["Brand blue", "Navy"], "allow_other": false},',
  ' {"text": "Anything else?", "choices": []}]',
  "```",
  "",
  "## Notes for developers",
  "- Check ThemeProvider",
].join("\n");

test("parseRequesterQuestions reads the fenced block", () => {
  assert.deepEqual(parseRequesterQuestions(STRUCTURED_SUMMARY), [
    { id: "shade", text: "Which shade of blue?", choices: ["Brand blue", "Navy"], allow_other: false },
    { id: "q2", text: "Anything else?", choices: [], allow_other: true },
  ]);
});

test("parseRequesterQuestions returns null for missing or invalid blocks", () => {
  assert.equal(parseRequesterQuestions(null), null);
  assert.equal(parseRequesterQuestions(`${REQUESTER_QUESTIONS_HEADING}\n- Which?`), null);
  const broken = STRUCTURED_SUMMARY.replace('"choices": []', '"choices": [3]');
  assert.equal(parseRequesterQuestions(broken), null);
  const notJson = STRUCTURED_SUMMARY.replace("[{", "{{");
  assert.equal(parseRequesterQuestions(notJson), null);
  const outside = `${REQUESTER_QUESTIONS_HEADING}\n- Which?\n\n## Notes\n\`\`\`json\n[{"text": "x"}]\n\`\`\``;
  assert.equal(parseRequesterQuestions(outside), null);
});

test("stripRequesterQuestionsJson keeps the Markdown questions and later sections", () => {
  const stripped = stripRequesterQuestionsJson(STRUCTURED_SUMMARY);
  assert.ok(!stripped.includes("```"));
  assert.equal(
    extractRequesterQuestionsSection(stripped),
    "- Which shade of blue?\n- Anything else?",
  );
  assert.ok(stripped.includes("## Notes for developers\n- Check ThemeProvider"));
});

test("formatRequesterAnswers pairs questions and answers", () => {
  const questions = parseRequesterQuestions(STRUCTURED_SUMMARY);
  assert.equal(
    formatRequesterAnswers(questions, { shade: "Navy" }),
    "Q: Which shade of blue?\nA: Navy\n\nQ: Anything else?\nA: (no preference)",
  );
});

test("resolveEffectiveRequesterFollowups inherits org then default", () => {
  assert.equal(resolveEffectiveRequesterFollowups(null, true), true);
  assert.equal(resolveEffectiveRequesterFollowups(null, false), false);
  assert.equal(resolveEffectiveRequesterFollowups(false, true), false);
  assert.equal(resolveEffectiveRequesterFollowups(true, false), true);
  assert.equal(resolveEffectiveRequesterFollowups(undefined, undefined), true);
});
