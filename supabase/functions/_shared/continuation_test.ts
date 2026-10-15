import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatContinuationSection } from "./continuation.ts";

Deno.test("continuation context tells the agent to start fresh and keeps the earlier outcome", () => {
  const section = formatContinuationSection({
    id: "11111111-1111-1111-1111-111111111111",
    prompt: "Change the wash interval to 3 days",
    status: "merged",
    summary: "The PDF wash interval is now 3 days.",
    pr_url: "https://github.com/example/app/pull/42",
    branch_name: "cursor/pdf-wash-interval",
  });

  assertStringIncludes(section, "## Earlier request");
  assertStringIncludes(section, "default branch");
  assertStringIncludes(section, "Earlier status: merged");
  assertStringIncludes(section, "Change the wash interval to 3 days");
  assertStringIncludes(section, "https://github.com/example/app/pull/42");
  assertStringIncludes(section, "The PDF wash interval is now 3 days.");
});

Deno.test("continuation context omits a missing outcome and clips a long summary", () => {
  const section = formatContinuationSection({
    id: "22222222-2222-2222-2222-222222222222",
    prompt: "Rename the heading",
    status: "error",
    summary: "x".repeat(2000),
    pr_url: null,
    branch_name: null,
  });

  assert(!section.includes("Earlier pull request"));
  assert(!section.includes("Earlier branch"));
  assert(section.includes("…"));
  assert(section.length < 2000);
});
