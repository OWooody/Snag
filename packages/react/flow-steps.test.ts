import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactPath, sanitizeFlowSteps, sanitizeLabel, stepsForRequest } from "./src/flow-steps.ts";

Deno.test("a single current page is not attached", () => {
  assertEquals(stepsForRequest([{ type: "navigate", path: "/checkout" }]), []);
});

Deno.test("a click and a later route are kept, without the promo code", () => {
  const steps = stepsForRequest([
    { type: "navigate", path: "/cart?promo=SUMMER" },
    { type: "click", path: "/cart", label: "Apply" },
    { type: "navigate", path: "/checkout" },
  ]);
  assertEquals(steps, [
    { type: "navigate", path: "/cart" },
    { type: "click", path: "/cart", label: "Apply" },
    { type: "navigate", path: "/checkout" },
  ]);
  assert(!JSON.stringify(steps).includes("SUMMER"));
});

Deno.test("client redaction matches the relay for secrets", () => {
  assertEquals(redactPath("/users/jane@example.com"), "/users/[redacted]");
  assertEquals(sanitizeLabel("jane@example.com"), null);
  assertEquals(sanitizeLabel("Apply"), "Apply");
  const steps = sanitizeFlowSteps([
    { type: "click", path: "/account", label: "snag_sk_live_secret" },
  ]);
  assertEquals(steps, []);
});
