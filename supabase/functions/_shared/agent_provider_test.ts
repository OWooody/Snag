import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summaryFromConversationMessages } from "./agent_provider.ts";

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
