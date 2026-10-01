import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isTrustedRequester,
  MAX_TOKEN_LIFETIME_SECONDS,
  signRequesterToken,
  verifyRequesterToken,
} from "./requester_token.ts";

const SECRET = "test-secret-with-enough-entropy-1234567890";
const NOW = 1_800_000_000;

Deno.test("verifyRequesterToken accepts a valid token", async () => {
  const token = await signRequesterToken("pm@example.com", SECRET, NOW + 3600);
  assertEquals(await verifyRequesterToken(token, SECRET, NOW), "pm@example.com");
});

Deno.test("verifyRequesterToken rejects forged, expired, and long-lived tokens", async () => {
  const token = await signRequesterToken("pm@example.com", SECRET, NOW + 3600);
  assertEquals(await verifyRequesterToken(token, "other-secret", NOW), null);

  const [version, , signature] = token.split(".");
  const forgedPayload = btoa(JSON.stringify({ sub: "admin@example.com", exp: NOW + 3600 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assertEquals(
    await verifyRequesterToken(`${version}.${forgedPayload}.${signature}`, SECRET, NOW),
    null,
  );

  const expired = await signRequesterToken("pm@example.com", SECRET, NOW - 1);
  assertEquals(await verifyRequesterToken(expired, SECRET, NOW), null);

  const forever = await signRequesterToken(
    "pm@example.com",
    SECRET,
    NOW + MAX_TOKEN_LIFETIME_SECONDS + 60,
  );
  assertEquals(await verifyRequesterToken(forever, SECRET, NOW), null);

  assertEquals(await verifyRequesterToken("garbage", SECRET, NOW), null);
  assertEquals(await verifyRequesterToken(null, SECRET, NOW), null);
});

Deno.test("isTrustedRequester requires verification and is case-insensitive", () => {
  assertEquals(isTrustedRequester("PM@example.com", true, ["pm@example.com"]), true);
  assertEquals(isTrustedRequester("pm@example.com", false, ["pm@example.com"]), false);
  assertEquals(isTrustedRequester("other@example.com", true, ["pm@example.com"]), false);
  assertEquals(isTrustedRequester(null, true, ["pm@example.com"]), false);
});
