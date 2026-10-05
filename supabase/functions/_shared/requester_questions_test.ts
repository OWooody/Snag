import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planningInstructions } from "./execute_prompts.ts";

Deno.test("planning instructions ask for a JSON copy of requester questions only when follow-ups are on", () => {
  const withFollowups = planningInstructions(true).join("\n");
  assertStringIncludes(withFollowups, "## Questions for requester");
  assertStringIncludes(withFollowups, '"choices": ["Brand blue", "Navy"]');

  const withoutFollowups = planningInstructions(false).join("\n");
  assert(!withoutFollowups.includes('"choices"'));
});
