import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requesterCanClose } from "./requester_close.ts";

Deno.test("a requester can close a request that is still open", () => {
  for (const status of [
    "queued",
    "running",
    "needs_input",
    "awaiting_requester",
    "awaiting_approval",
    "awaiting_review",
    "awaiting_confirmation",
  ]) {
    assertEquals(requesterCanClose(status), true);
  }
});

Deno.test("a requester cannot close a request that already ended", () => {
  for (const status of ["finished", "merged", "error", "rejected", "closed_by_requester"]) {
    assertEquals(requesterCanClose(status), false);
  }
});
