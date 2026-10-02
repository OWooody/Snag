import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SNAG_PLAN_HEADING,
  buildImplementationPrompt,
  buildPlanRevisionPrompt,
  parseSnagPlan,
  POLICY_TEMPLATES,
  policyRuleBulkCreateSchema,
  policyRuleCreateSchema,
  projectExecutionUpdateSchema,
  requestReviewDecisionSchema,
  resolveEffectiveDefaultOutcome,
  resolveEffectiveExecuteDelivery,
  strictestOutcome,
  stripSnagPlanSection,
} from "../dist/index.js";

const planSummary = [
  "Change the header color.",
  "",
  "## Notes for developers",
  "- ThemeProvider owns the palette",
  "",
  SNAG_PLAN_HEADING,
  "```json",
  JSON.stringify({
    files: ["./src/header.tsx", "src/header.tsx", "src/theme.ts"],
    risk: "low",
    flags: ["schema", "not-a-flag"],
    summary: "Swap the header token",
  }),
  "```",
].join("\n");

test("parseSnagPlan reads files, risk, and known flags", () => {
  assert.deepEqual(parseSnagPlan(planSummary), {
    files: ["src/header.tsx", "src/theme.ts"],
    risk: "low",
    flags: ["schema"],
    summary: "Swap the header token",
  });
});

test("parseSnagPlan rejects missing or invalid blocks", () => {
  assert.equal(parseSnagPlan(null), null);
  assert.equal(parseSnagPlan("No plan here"), null);
  assert.equal(parseSnagPlan(`${SNAG_PLAN_HEADING}\n\`\`\`json\n{not json}\n\`\`\``), null);
  assert.equal(
    parseSnagPlan(`${SNAG_PLAN_HEADING}\n\`\`\`json\n{"files":[],"risk":"extreme"}\n\`\`\``),
    null,
  );
  assert.equal(parseSnagPlan(`${SNAG_PLAN_HEADING}\n\`\`\`json\n{"risk":"low"}\n\`\`\``), null);
});

test("stripSnagPlanSection keeps the human-readable summary", () => {
  const stripped = stripSnagPlanSection(planSummary);
  assert.ok(!stripped.includes(SNAG_PLAN_HEADING));
  assert.ok(stripped.includes("## Notes for developers"));
  assert.equal(stripSnagPlanSection("plain"), "plain");
  assert.equal(
    stripSnagPlanSection(
      'Intro.\n\n## Snag plan\n```json\n{"files":[]}\n```\n\n## Notes for developers\n- x',
    ),
    "Intro.\n\n## Notes for developers\n- x",
  );
});

test("strictestOutcome orders outcomes", () => {
  assert.equal(strictestOutcome(), "execute");
  assert.equal(strictestOutcome("execute", "review_before_merge"), "review_before_merge");
  assert.equal(
    strictestOutcome("review_before_execution", "review_before_merge"),
    "review_before_execution",
  );
});

test("delivery and default outcome inherit project, then org, then default", () => {
  assert.equal(resolveEffectiveExecuteDelivery(null, null), "pr_only");
  assert.equal(resolveEffectiveExecuteDelivery(null, "auto_merge"), "auto_merge");
  assert.equal(resolveEffectiveExecuteDelivery("preview_confirm", "auto_merge"), "preview_confirm");
  assert.equal(resolveEffectiveDefaultOutcome(null, null), "review_before_execution");
  assert.equal(resolveEffectiveDefaultOutcome("execute", "review_before_merge"), "execute");
});

test("policy rule schema ties kind to outcome", () => {
  const allow = policyRuleCreateSchema.safeParse({
    name: "Copy changes",
    kind: "allow",
    outcome: "execute",
    condition: { all: [{ type: "path_glob_all", globs: ["src/copy/**"] }] },
  });
  assert.equal(allow.success, true);
  assert.equal(allow.data.scope, "project");

  const badAllow = policyRuleCreateSchema.safeParse({
    name: "Bad",
    kind: "allow",
    outcome: "review_before_merge",
    condition: { all: [{ type: "requester_unverified" }] },
  });
  assert.equal(badAllow.success, false);

  const escalateExecute = policyRuleCreateSchema.safeParse({
    name: "Bad",
    kind: "escalate",
    outcome: "execute",
    condition: { all: [{ type: "requester_unverified" }] },
  });
  assert.equal(escalateExecute.success, false);
});

test("projectExecutionUpdateSchema validates requester ids", () => {
  const ok = projectExecutionUpdateSchema.safeParse({
    execute_delivery: null,
    default_outcome: null,
    policy_shadow_mode: null,
    trusted_requesters: ["pm@example.com"],
    auto_merge_daily_limit: 5,
  });
  assert.equal(ok.success, true);
  const bad = projectExecutionUpdateSchema.safeParse({
    execute_delivery: "auto_merge",
    default_outcome: null,
    policy_shadow_mode: null,
    trusted_requesters: ["émoji"],
    auto_merge_daily_limit: 5,
  });
  assert.equal(bad.success, false);
});

test("buildImplementationPrompt names the base ref and forbids merging", () => {
  const prompt = buildImplementationPrompt({
    baseRef: "main",
    approvedBy: "developer",
    developerNote: "Keep the old color as a fallback.",
  });
  assert.ok(prompt.includes("`main`"));
  assert.ok(prompt.includes("Do NOT merge"));
  assert.ok(prompt.includes("Keep the old color as a fallback."));
});

test("buildPlanRevisionPrompt keeps the agent planning and asks for a new plan block", () => {
  const prompt = buildPlanRevisionPrompt("  Use the existing Button component.  ");
  assert.ok(prompt.includes("Use the existing Button component."));
  assert.ok(prompt.includes("Do NOT edit files"));
  assert.ok(prompt.includes(SNAG_PLAN_HEADING));
});

test("sending a plan back requires a note", () => {
  assert.equal(requestReviewDecisionSchema.safeParse({ decision: "revise" }).success, false);
  assert.equal(
    requestReviewDecisionSchema.safeParse({ decision: "revise", note: "   " }).success,
    false,
  );
  assert.equal(
    requestReviewDecisionSchema.safeParse({ decision: "revise", note: "Smaller change" }).success,
    true,
  );
  assert.equal(requestReviewDecisionSchema.safeParse({ decision: "reject" }).success, true);
});

test("every policy template passes rule validation", () => {
  for (const template of POLICY_TEMPLATES) {
    const parsed = policyRuleBulkCreateSchema.safeParse({
      scope: "project",
      template_id: template.id,
      rules: template.rules.map(({ name, kind, outcome, condition }) => ({
        name,
        kind,
        outcome,
        condition,
      })),
    });
    assert.equal(parsed.success, true, template.id);
  }
});
