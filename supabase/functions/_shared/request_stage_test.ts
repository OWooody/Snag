import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PolicyStageDecision } from "./policy.ts";
import {
  blockedRulesFromDecision,
  handoffCodeFromReason,
  rejectionReasonForRow,
  requestStageCode,
  requestStageLabel,
} from "./request_stage.ts";

function diff(delivery: PolicyStageDecision["delivery"]): { diff: PolicyStageDecision } {
  return {
    diff: {
      stage: "diff",
      computed_outcome: "execute",
      outcome: "execute",
      shadow_outcome: "execute",
      project_shadow: false,
      matched: [],
      reasons: [],
      delivery,
      evaluated_at: "2026-10-01T11:00:00Z",
    },
  };
}

const base = { status: "running", confirmed_at: null, policy_decision: null };

Deno.test("running phases map to stage labels", () => {
  assertEquals(requestStageLabel({ ...base, phase: "planning" }), "Planning");
  assertEquals(requestStageLabel({ ...base, phase: "implementing" }), "Building");
});

Deno.test("delivery waits for a preview until the requester confirms", () => {
  const delivering = { ...base, phase: "delivering" as const, policy_decision: diff("preview_confirm") };
  assertEquals(requestStageLabel(delivering), "Waiting for preview");
  assertEquals(
    requestStageLabel({ ...delivering, confirmed_at: "2026-10-01T11:30:00Z" }),
    "Waiting for checks",
  );
  assertEquals(
    requestStageLabel({ ...delivering, policy_decision: diff("auto_merge") }),
    "Waiting for checks",
  );
});

Deno.test("non-running and plan-only requests have no stage label", () => {
  assertEquals(requestStageLabel({ ...base, status: "queued", phase: "planning" }), null);
  assertEquals(requestStageLabel({ ...base, status: "needs_input", phase: "planning" }), null);
  assertEquals(requestStageLabel({ ...base, phase: null }), null);
});

Deno.test("running phases also map to stage codes", () => {
  assertEquals(requestStageCode({ ...base, phase: "planning" }), "planning");
  assertEquals(requestStageCode({ ...base, phase: "implementing" }), "building");
  assertEquals(
    requestStageCode({ ...base, phase: "delivering", policy_decision: diff("preview_confirm") }),
    "waiting_preview",
  );
});

Deno.test("handoff reasons map to stable codes", () => {
  assertEquals(handoffCodeFromReason("The agent finished without opening a pull request."), "no_pr");
  assertEquals(handoffCodeFromReason("Snag could not authenticate to GitHub."), "auth_failed");
  assertEquals(handoffCodeFromReason(null), null);
});

Deno.test("rejected rows with block rules are policy blocks", () => {
  const blocked = {
    status: "rejected",
    policy_decision: {
      final_outcome: "blocked" as const,
      plan: {
        stage: "plan" as const,
        computed_outcome: "blocked" as const,
        outcome: "blocked" as const,
        shadow_outcome: "blocked" as const,
        project_shadow: false,
        matched: [{
          id: "r1",
          name: "Block admin user changes",
          kind: "block" as const,
          outcome: "blocked" as const,
          shadow: false,
        }],
        reasons: [],
        delivery: "pr_only" as const,
        evaluated_at: "2026-10-01T11:00:00Z",
      },
    },
  };
  assertEquals(rejectionReasonForRow(blocked), "policy_block");
  assertEquals(blockedRulesFromDecision(blocked.policy_decision), ["Block admin user changes"]);
  assertEquals(rejectionReasonForRow({ status: "rejected", policy_decision: null }), "developer");
});
