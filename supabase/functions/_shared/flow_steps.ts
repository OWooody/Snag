/**
 * Recent route and click trail attached to a change request.
 *
 * Redaction is duplicated in packages/react/src/flow-steps.ts. Keep the two
 * copies in sync. This copy is the boundary that runs on the relay: a client
 * cannot put a query string, a field value, or a secret-shaped segment into
 * the agent prompt or the stored context.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const MAX_FLOW_STEPS = 8;
export const REDACTED = "[redacted]";
export const STEPS_CONTEXT_KEY = "snag_steps";

const MAX_LABEL_LENGTH = 48;
const MAX_RAW_LABEL_LENGTH = 60;
const MAX_PATH_LENGTH = 240;

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

const flowStepSchema = z.object({
  type: z.enum(["navigate", "click"]),
  path: z.string().max(2000),
  label: z.string().max(500).optional(),
});

export interface FlowStep {
  type: "navigate" | "click";
  path: string;
  label?: string;
}

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
  let next = replaceSensitiveText(words.join(" ")).replace(/\s+/g, " ").replace(/`/g, "'").trim();
  const leftover = next.split(REDACTED).join("").trim();
  if (!leftover) return null;
  if (next.length > MAX_LABEL_LENGTH) next = next.slice(0, MAX_LABEL_LENGTH).trim();
  return next || null;
}

function pushCapped(steps: FlowStep[], step: FlowStep): void {
  const last = steps[steps.length - 1];
  if (last && last.type === step.type && last.path === step.path && last.label === step.label) {
    return;
  }
  steps.push(step);
  if (steps.length > MAX_FLOW_STEPS) steps.shift();
}

export function sanitizeFlowSteps(steps: readonly FlowStep[]): FlowStep[] {
  const clean: FlowStep[] = [];
  for (const step of steps) {
    const path = redactPath(step.path);
    if (!path) continue;
    if (step.type === "navigate") {
      pushCapped(clean, { type: "navigate", path });
      continue;
    }
    const label = step.label ? sanitizeLabel(step.label) : null;
    if (!label) continue;
    pushCapped(clean, { type: "click", path, label });
  }
  return clean;
}

/** Accepts untrusted JSON. Invalid entries are dropped; they never fail the request. */
export function readFlowSteps(value: unknown): FlowStep[] {
  if (!Array.isArray(value)) return [];
  const parsed: FlowStep[] = [];
  for (const item of value.slice(-MAX_FLOW_STEPS)) {
    const result = flowStepSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return sanitizeFlowSteps(parsed);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/`/g, "'").trim();
}

export function formatFlowSteps(steps: FlowStep[] | null | undefined): string[] {
  if (!steps || steps.length === 0) return [];
  const lines = [
    "## How they got here",
    "Recorded automatically from the screens before this request. Paths have no query string, and values that look like emails, tokens, or secrets are removed. The change request and the current screen are the source of truth — ignore a step that is unrelated.",
  ];
  steps.forEach((step, index) => {
    const path = clean(step.path);
    if (step.type === "click" && step.label) {
      lines.push(`${index + 1}. On \`${path}\` clicked "${clean(step.label)}"`);
    } else {
      lines.push(`${index + 1}. Opened \`${path}\``);
    }
  });
  return lines;
}
