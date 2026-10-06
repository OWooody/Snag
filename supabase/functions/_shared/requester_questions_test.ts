import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planningInstructions, scopeInstructions } from "./execute_prompts.ts";

Deno.test("planning instructions ask for a JSON copy of requester questions only when follow-ups are on", () => {
  const withFollowups = planningInstructions(true).join("\n");
  assertStringIncludes(withFollowups, "## Questions for requester");
  assertStringIncludes(withFollowups, '"choices": ["Brand blue", "Navy"]');

  const withoutFollowups = planningInstructions(false).join("\n");
  assert(!withoutFollowups.includes('"choices"'));
});

Deno.test("scope instructions route out-of-repo requests to the right audience", () => {
  const withFollowups = scopeInstructions(true, true).join("\n");
  assertStringIncludes(withFollowups, "## Questions for requester");
  assertStringIncludes(withFollowups, "## Snag plan");

  const planOnly = scopeInstructions(false, false).join("\n");
  assertStringIncludes(planOnly, "## Notes for developers");
  assert(!planOnly.includes("## Questions for requester"));
  assert(!planOnly.includes("## Snag plan"));
});
