/**
 * Validate the optional `preview` list in a Snag plan: a few safe page edits
 * the SDK applies temporarily so the requester can see roughly what the
 * change will look like. Agent output is untrusted, so anything unexpected
 * drops the whole preview.
 * Mirrored in supabase/functions/_shared/preview_ops.ts and
 * packages/react/src/dom-preview.ts — keep in sync.
 */

export const PREVIEW_ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
export type PreviewAttribute = (typeof PREVIEW_ATTRIBUTES)[number];

export type PreviewOp =
  | { op: "css"; selector: string; style: Record<string, string> }
  | { op: "text"; selector: string; text: string }
  | { op: "hide"; selector: string }
  | { op: "move"; selector: string; before: string }
  | { op: "move"; selector: string; after: string }
  | { op: "attr"; selector: string; name: PreviewAttribute; value: string };

const MAX_OPS = 20;
const MAX_SELECTOR = 300;
const MAX_STYLE_PROPS = 12;
const MAX_STYLE_VALUE = 200;
const MAX_TEXT = 500;
const MAX_ATTR_VALUE = 300;
const STYLE_PROPERTY = /^(--)?[a-z][a-z0-9-]{0,39}$/;
const UNSAFE_STYLE_VALUE = /url\s*\(|expression\s*\(|javascript:|@import|[{};<>\\]/i;

function selector(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SELECTOR || /[{};]/.test(trimmed)) return null;
  return trimmed;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value : null;
}

function style(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_STYLE_PROPS) return null;
  const result: Record<string, string> = {};
  for (const [property, raw] of entries) {
    const name = property.trim().toLowerCase();
    if (!STYLE_PROPERTY.test(name)) return null;
    const text = boundedString(raw, MAX_STYLE_VALUE)?.trim();
    if (!text || UNSAFE_STYLE_VALUE.test(text)) return null;
    result[name] = text;
  }
  return result;
}

function op(value: unknown): PreviewOp | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const target = selector(item.selector);
  if (!target) return null;
  switch (item.op) {
    case "css": {
      const parsed = style(item.style);
      return parsed ? { op: "css", selector: target, style: parsed } : null;
    }
    case "text": {
      const text = boundedString(item.text, MAX_TEXT);
      return text === null ? null : { op: "text", selector: target, text };
    }
    case "hide":
      return { op: "hide", selector: target };
    case "move": {
      const before = item.before === undefined ? null : selector(item.before);
      const after = item.after === undefined ? null : selector(item.after);
      if (before && !after) return { op: "move", selector: target, before };
      if (after && !before) return { op: "move", selector: target, after };
      return null;
    }
    case "attr": {
      const name = (PREVIEW_ATTRIBUTES as readonly string[]).includes(item.name as string)
        ? (item.name as PreviewAttribute)
        : null;
      const attrValue = boundedString(item.value, MAX_ATTR_VALUE);
      return name && attrValue !== null
        ? { op: "attr", selector: target, name, value: attrValue }
        : null;
    }
    default:
      return null;
  }
}

/** Valid preview ops, or null when the list is missing, empty, or has anything invalid. */
export function parsePreviewOps(value: unknown): PreviewOp[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OPS) return null;
  const ops: PreviewOp[] = [];
  for (const item of value) {
    const parsed = op(item);
    if (!parsed) return null;
    ops.push(parsed);
  }
  return ops;
}
