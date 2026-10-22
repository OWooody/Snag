import type { SnagFlowStep } from "./protocol";

/**
 * Redaction for the recent-steps trail.
 *
 * The same rules run again in supabase/functions/_shared/flow_steps.ts.
 * Keep the two copies in sync. The relay is the backstop: a modified client
 * still cannot attach a query string, a field value, or a secret-shaped path.
 */

export const MAX_FLOW_STEPS = 8;
export const REDACTED = "[redacted]";

const MAX_LABEL_LENGTH = 48;
/** Labels longer than this are user content, not a control name. */
const MAX_RAW_LABEL_LENGTH = 60;
const MAX_PATH_LENGTH = 240;

/** Path segments whose following segment is a credential, not a page name. */
const SECRET_SEGMENT = new Set([
  "token",
  "secret",
  "password",
  "passwd",
  "pwd",
  "session",
  "apikey",
  "api-key",
  "jwt",
  "refresh-token",
  "access-token",
  "otp",
  "signature",
  "credential",
  "credentials",
  "email",
  "e-mail",
  "phone",
  "ssn",
  "cvv",
  "authorization",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{20,}$/i;
const JWT_SEGMENT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

function stripHidden(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "");
}

function isOpaqueToken(value: string): boolean {
  if (value.length < 32 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  if (digits >= 8) return true;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) return true;
  if (!value.includes("-") && !value.includes("_")) return true;
  return false;
}

function isSensitiveSegment(value: string): boolean {
  if (!value) return false;
  if (/\s/.test(value) || /[=&?#@]/.test(value)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) return true;
  if (UUID.test(value) || LONG_HEX.test(value) || JWT_SEGMENT.test(value)) return true;
  if (isOpaqueToken(value)) return true;
  if (/(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/.test(value)) return true;
  if (/\b(?:\d[ -]?){13,19}\b/.test(value)) return true;
  return false;
}

function replaceSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/g, REDACTED)
    .replace(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, REDACTED)
    .replace(/\b[0-9a-f]{20,}\b/gi, REDACTED);
}

/** Pathname only. Query, hash, emails, and secret-shaped segments are removed. */
export function redactPath(input: string): string | null {
  let raw = stripHidden(input).trim();
  if (!raw) return null;
  if (raw.includes("://") || raw.startsWith("//")) {
    try {
      raw = new URL(raw.startsWith("//") ? `https:${raw}` : raw).pathname;
    } catch {
      return null;
    }
  }
  raw = raw.split(/[?#]/)[0] ?? "";
  if (!raw.startsWith("/")) raw = `/${raw}`;

  const segments = raw.split("/");
  let redactNext = false;
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment) {
      out.push("");
      continue;
    }
    let decoded: string;
    try {
      decoded = stripHidden(decodeURIComponent(segment));
    } catch {
      out.push(REDACTED);
      redactNext = false;
      continue;
    }
    if (redactNext || isSensitiveSegment(decoded)) {
      out.push(REDACTED);
    } else {
      out.push(decoded);
    }
    redactNext = SECRET_SEGMENT.has(decoded.toLowerCase());
  }

  let path = out.join("/").replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path.startsWith("/") || path.length > MAX_PATH_LENGTH) return null;
  return path;
}

/** Short control name. Returns null when the text is empty, too long, or only a secret. */
export function sanitizeLabel(input: string): string | null {
  const collapsed = stripHidden(input).replace(/\s+/g, " ").trim();
  if (!collapsed || collapsed.length > MAX_RAW_LABEL_LENGTH) return null;
  if (/snag_(?:pk|sk)_|sk_live|sk_test|bearer\s+/i.test(collapsed)) return null;

  const words = collapsed.split(" ").map((word) => {
    const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (bare && (isSensitiveSegment(bare) || isOpaqueToken(bare))) {
      return word.replace(bare, REDACTED);
    }
    return word;
  });
  const nextRaw = replaceSensitiveText(words.join(" ")).replace(/\s+/g, " ").replace(/`/g, "'").trim();
  const leftover = nextRaw.split(REDACTED).join("").trim();
  let next = nextRaw;
  if (!leftover) return null;
  if (next.length > MAX_LABEL_LENGTH) next = next.slice(0, MAX_LABEL_LENGTH).trim();
  return next || null;
}

function pushCapped(steps: SnagFlowStep[], step: SnagFlowStep): void {
  const last = steps[steps.length - 1];
  if (last && last.type === step.type && last.path === step.path && last.label === step.label) return;
  steps.push(step);
  if (steps.length > MAX_FLOW_STEPS) steps.shift();
}

/** Drops anything that is not a safe route or a safe control label. */
export function sanitizeFlowSteps(
  steps: readonly SnagFlowStep[] | null | undefined,
): SnagFlowStep[] {
  if (!steps) return [];
  const clean: SnagFlowStep[] = [];
  for (const step of steps) {
    if (!step || (step.type !== "navigate" && step.type !== "click")) continue;
    if (typeof step.path !== "string") continue;
    const path = redactPath(step.path);
    if (!path) continue;
    if (step.type === "navigate") {
      pushCapped(clean, { type: "navigate", path });
      continue;
    }
    if (typeof step.label !== "string") continue;
    const label = sanitizeLabel(step.label);
    if (!label) continue;
    pushCapped(clean, { type: "click", path, label });
  }
  return clean;
}

/**
 * A trail that is only the page they are already on adds nothing the screenshot
 * does not show. Clicks, or two different paths, are worth attaching.
 */
export function stepsForRequest(steps: readonly SnagFlowStep[]): SnagFlowStep[] {
  const safe = sanitizeFlowSteps(steps);
  const paths = new Set(safe.map((step) => step.path));
  if (!safe.some((step) => step.type === "click") && paths.size < 2) return [];
  return safe;
}
