import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUESTER_QUESTIONS_HEADING,
  extractRequesterQuestionsSection,
  resolveEffectiveRequesterFollowups,
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

test("resolveEffectiveRequesterFollowups inherits org then default", () => {
  assert.equal(resolveEffectiveRequesterFollowups(null, true), true);
  assert.equal(resolveEffectiveRequesterFollowups(null, false), false);
  assert.equal(resolveEffectiveRequesterFollowups(false, true), false);
  assert.equal(resolveEffectiveRequesterFollowups(true, false), true);
  assert.equal(resolveEffectiveRequesterFollowups(undefined, undefined), true);
});
