import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  capStoredSummary,
  resolveTerminalSummary,
  summaryFromConversationMessages,
  summaryNeedsConversation,
  type AgentProvider,
} from "./agent_provider.ts";
import { parseSnagPlan } from "./plan_block.ts";

const PLAN = [
  "## Snag plan",
  "```json",
  '{"files":["src/a.ts"],"risk":"low","flags":[],"summary":"Rename the heading"}',
  "```",
].join("\n");

function provider(conversation: string | null): AgentProvider {
  return {
    getConversationSummary: () => Promise.resolve(conversation),
  } as unknown as AgentProvider;
}

Deno.test("summaryFromConversationMessages joins trailing assistant turns", () => {
  const summary = summaryFromConversationMessages([
    { type: "user_message", text: "Please add dark mode" },
    { type: "assistant_message", text: "I looked at the theme tokens." },
    {
      type: "assistant_message",
      text: "## Questions for requester\n\n1. Should dark mode follow system?",
    },
  ]);
  assertEquals(
    summary,
    "I looked at the theme tokens.\n\n## Questions for requester\n\n1. Should dark mode follow system?",
  );
});

Deno.test("summaryFromConversationMessages ignores earlier assistant after a user turn", () => {
  const summary = summaryFromConversationMessages([
    { type: "assistant_message", text: "Old answer" },
    { type: "user_message", text: "Reply: yes" },
    { type: "assistant_message", text: "## Questions for requester\n\n1. Scope?" },
  ]);
  assertEquals(summary, "## Questions for requester\n\n1. Scope?");
});

Deno.test("summaryFromConversationMessages returns null when empty", () => {
  assertEquals(summaryFromConversationMessages(undefined), null);
  assertEquals(summaryFromConversationMessages([]), null);
  assertEquals(
    summaryFromConversationMessages([{ type: "user_message", text: "hi" }]),
    null,
  );
});

Deno.test("summaryFromConversationMessages keeps a Snag plan past the size cap", () => {
  const summary = summaryFromConversationMessages([
    { type: "assistant_message", text: "x".repeat(12_000) },
    { type: "assistant_message", text: PLAN },
  ]);
  assertEquals(parseSnagPlan(summary)?.files, ["src/a.ts"]);
  assertEquals(summary!.length <= 12_000, true);
});

Deno.test("capStoredSummary still keeps the start when there is no plan", () => {
  const text = `${"a".repeat(12_000)}TAIL`;
  assertEquals(capStoredSummary(text), "a".repeat(12_000));
});

Deno.test("planning summary falls back to the conversation when Cursor's summary has no plan", async () => {
  const notes = `Notes for developers\n\nUpdate name_ar.\n\n${PLAN}`;
  const summary = await resolveTerminalSummary(
    provider(notes),
    "agent-1",
    "I'll locate the exact code and write a plan only — no edits yet.",
    "planning",
  );
  assertEquals(parseSnagPlan(summary)?.files, ["src/a.ts"]);
  assertEquals(summary?.includes("Update name_ar."), true);
});

Deno.test("planning summary keeps Cursor's summary when it already has a plan", async () => {
  let calls = 0;
  const summary = await resolveTerminalSummary(
    {
      getConversationSummary: () => {
        calls += 1;
        return Promise.resolve("should not be read");
      },
    } as unknown as AgentProvider,
    "agent-1",
    PLAN,
    "planning",
  );
  assertEquals(calls, 0);
  assertEquals(parseSnagPlan(summary)?.files, ["src/a.ts"]);
});

Deno.test("planning summary keeps the short text when the conversation also has no plan", async () => {
  const short = "I'll locate the exact code and write a plan only — no edits yet.";
  const summary = await resolveTerminalSummary(
    provider("Still looking."),
    "agent-1",
    short,
    "planning",
  );
  assertEquals(summary, short);
});

Deno.test("summaryNeedsConversation only forces a read during planning", () => {
  assertEquals(summaryNeedsConversation("I'll look.", "planning"), true);
  assertEquals(summaryNeedsConversation(PLAN, "planning"), false);
  assertEquals(summaryNeedsConversation("Implemented.", "implementing"), false);
  assertEquals(summaryNeedsConversation(null, "implementing"), true);
  assertEquals(summaryNeedsConversation(null, null), true);
});
