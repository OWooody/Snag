/**
 * Verified requester identity for execute-mode policy.
 *
 * Host backends sign `x-snag-requester-token` with the project's requester
 * signing secret:
 *   v1.<base64url(JSON {sub, exp})>.<base64url(HMAC-SHA256(secret, "v1." + payload))>
 * `exp` is a Unix timestamp in seconds. Tokens valid for more than
 * MAX_TOKEN_LIFETIME_SECONDS are rejected so a leaked token cannot live forever.
 */

export const MAX_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const MAX_TOKEN_LENGTH = 1024;
const MAX_SUBJECT_LENGTH = 128;
const SUBJECT_PATTERN = /^[\x20-\x7E]+$/;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

export async function signRequesterToken(
  subject: string,
  secret: string,
  expiresAtSeconds: number,
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ sub: subject, exp: expiresAtSeconds })),
  );
  const signature = base64UrlEncode(await hmac(secret, `v1.${payload}`));
  return `v1.${payload}.${signature}`;
}

/** Returns the verified requester id, or null when the token is missing, malformed, expired, or forged. */
export async function verifyRequesterToken(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, signature] = parts;

  const provided = base64UrlDecode(signature);
  if (!provided) return null;
  const expected = await hmac(secret, `v1.${payload}`);
  if (!constantTimeEqual(provided, expected)) return null;

  const payloadBytes = base64UrlDecode(payload);
  if (!payloadBytes) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  const { sub, exp } = (claims ?? {}) as { sub?: unknown; exp?: unknown };
  if (typeof sub !== "string" || typeof exp !== "number") return null;
  const subject = sub.trim();
  if (
    !subject ||
    subject.length > MAX_SUBJECT_LENGTH ||
    !SUBJECT_PATTERN.test(subject)
  ) {
    return null;
  }
  if (exp <= nowSeconds || exp > nowSeconds + MAX_TOKEN_LIFETIME_SECONDS) {
    return null;
  }
  return subject;
}

export function isTrustedRequester(
  requester: string | null,
  verified: boolean,
  trustedRequesters: string[] | null | undefined,
): boolean {
  if (!requester || !verified) return false;
  const normalized = requester.toLowerCase();
  return (trustedRequesters ?? []).some(
    (entry) => entry.trim().toLowerCase() === normalized,
  );
}
