import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatFlowSteps,
  readFlowSteps,
  redactPath,
  sanitizeLabel,
} from "./flow_steps.ts";

Deno.test("redactPath keeps ordinary routes and drops the query string", () => {
  assertEquals(redactPath("/cart"), "/cart");
  assertEquals(redactPath("/orders/1042"), "/orders/1042");
  assertEquals(redactPath("/checkout?token=abc&email=a@b.co#done"), "/checkout");
  assertEquals(
    redactPath("https://app.example.com/cart?session=secret#frag"),
    "/cart",
  );
});

Deno.test("redactPath removes emails, tokens, and the segment after a secret key", () => {
  assertEquals(redactPath("/users/jane@example.com/orders"), "/users/[redacted]/orders");
  assertEquals(
    redactPath("/reset/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcDEF12"),
    "/reset/[redacted]",
  );
  assertEquals(
    redactPath("/session/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
    "/session/[redacted]",
  );
  assertEquals(redactPath("/invite/0123456789abcdef0123456789abcdef"), "/invite/[redacted]");
  assertEquals(redactPath("/team/checkout-confirmation-page"), "/team/checkout-confirmation-page");
});

Deno.test("sanitizeLabel keeps a control name and drops a secret", () => {
  assertEquals(sanitizeLabel("Apply"), "Apply");
  assertEquals(sanitizeLabel("Reset password"), "Reset password");
  assertEquals(sanitizeLabel("Pay jane@example.com now"), "Pay [redacted] now");
  assertEquals(sanitizeLabel("jane@example.com"), null);
  assertEquals(sanitizeLabel("snag_pk_live_secret"), null);
  assertEquals(sanitizeLabel("A".repeat(61)), null);
});

Deno.test("readFlowSteps strips extra fields and unsafe steps", () => {
  const steps = readFlowSteps([
    { type: "navigate", path: "/cart?promo=SUMMER", value: "SUMMER" },
    { type: "click", path: "/cart", label: "Apply", value: "SUMMER" },
    { type: "click", path: "/cart", label: "jane@example.com" },
    { type: "navigate", path: "/checkout" },
    { type: "nope", path: "/billing" },
  ]);
  assertEquals(steps, [
    { type: "navigate", path: "/cart" },
    { type: "click", path: "/cart", label: "Apply" },
    { type: "navigate", path: "/checkout" },
  ]);
  assert(!JSON.stringify(steps).includes("SUMMER"));
  assert(!JSON.stringify(steps).includes("jane@"));
});

Deno.test("formatFlowSteps tells the agent the trail is context, not the request", () => {
  const text = formatFlowSteps([
    { type: "navigate", path: "/cart" },
    { type: "click", path: "/cart", label: "Apply" },
    { type: "navigate", path: "/checkout" },
  ]).join("\n");
  assertStringIncludes(text, "## How they got here");
  assertStringIncludes(text, "source of truth");
  assertStringIncludes(text, "1. Opened `/cart`");
  assertStringIncludes(text, '2. On `/cart` clicked "Apply"');
  assertStringIncludes(text, "3. Opened `/checkout`");
  assertEquals(formatFlowSteps([]), []);
});
