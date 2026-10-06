import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { planningInstructions } from "./execute_prompts.ts";
import { parseSnagPlan, SNAG_PLAN_HEADING } from "./plan_block.ts";
import { parsePreviewOps } from "./preview_ops.ts";

Deno.test("parsePreviewOps keeps each allowed op", () => {
  assertEquals(
    parsePreviewOps([
      { op: "css", selector: "#save", style: { Background: " #2563eb ", "--gap": "8px" } },
      { op: "text", selector: "h1", text: "Welcome back" },
      { op: "hide", selector: ".promo" },
      { op: "move", selector: "#save", after: "#cancel" },
      { op: "attr", selector: "input", name: "placeholder", value: "Search" },
    ]),
    [
      { op: "css", selector: "#save", style: { background: "#2563eb", "--gap": "8px" } },
      { op: "text", selector: "h1", text: "Welcome back" },
      { op: "hide", selector: ".promo" },
      { op: "move", selector: "#save", after: "#cancel" },
      { op: "attr", selector: "input", name: "placeholder", value: "Search" },
    ],
  );
});

Deno.test("parsePreviewOps drops the whole preview for anything unsafe or unknown", () => {
  const unsafe = [
    [{ op: "css", selector: "body", style: { background: "url(https://x.test/a.png)" } }],
    [{ op: "css", selector: "body", style: { color: "red; position: fixed" } }],
    [{ op: "css", selector: "a } body { color: red", style: { color: "red" } }],
    [{ op: "css", selector: "a", style: { "background:": "red" } }],
    [{ op: "attr", selector: "a", name: "onclick", value: "alert(1)" }],
    [{ op: "attr", selector: "a", name: "href", value: "javascript:alert(1)" }],
    [{ op: "html", selector: "a", html: "<img onerror=alert(1)>" }],
    [{ op: "move", selector: "a", before: "b", after: "c" }],
    [{ op: "hide", selector: "" }],
    [],
    "not a list",
  ];
  for (const value of unsafe) assertEquals(parsePreviewOps(value), null);
  assertEquals(
    parsePreviewOps([{ op: "hide", selector: ".ok" }, { op: "html", selector: "a" }]),
    null,
  );
});

Deno.test("parseSnagPlan attaches a valid preview and ignores an invalid one", () => {
  const plan = (preview: unknown) =>
    parseSnagPlan(
      `${SNAG_PLAN_HEADING}\n\`\`\`json\n${
        JSON.stringify({ files: ["a.tsx"], risk: "low", flags: [], preview })
      }\n\`\`\``,
    );
  assertEquals(plan([{ op: "hide", selector: ".promo" }])?.preview, [
    { op: "hide", selector: ".promo" },
  ]);
  assertEquals("preview" in plan([{ op: "script" }])!, false);
});

Deno.test("planning instructions state the limits parsePreviewOps enforces", () => {
  const instructions = planningInstructions(true, true).join("\n");
  assertStringIncludes(instructions, "at most 20 ops");
  assertStringIncludes(instructions, "at most 12 style properties");
  const styleOf = (count: number) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`--p${i}`, "1px"]));
  const hides = (count: number) =>
    Array.from({ length: count }, () => ({ op: "hide", selector: ".x" }));
  assertEquals(parsePreviewOps([{ op: "css", selector: "a", style: styleOf(12) }])?.length, 1);
  assertEquals(parsePreviewOps([{ op: "css", selector: "a", style: styleOf(13) }]), null);
  assertEquals(parsePreviewOps(hides(20))?.length, 20);
  assertEquals(parsePreviewOps(hides(21)), null);
});

Deno.test("planning instructions describe preview ops only when plan review is on", () => {
  assertStringIncludes(planningInstructions(true, true).join("\n"), "Allowed ops: css");
  assertEquals(planningInstructions(true, false).join("\n").includes("Allowed ops"), false);
});
