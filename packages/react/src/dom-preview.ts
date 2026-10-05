/**
 * Approximate preview of a plan on the live page. Applies a short list of
 * validated edits, keeps them applied while the host app re-renders, and
 * puts everything back on revert. Nothing here runs agent-supplied code or
 * HTML: text is set as text, styles go through property-by-property checks,
 * and only a few harmless attributes can change.
 *
 * `parsePreviewOps` mirrors supabase/functions/_shared/preview_ops.ts and
 * packages/shared/src/preview-ops.ts — keep in sync. It runs again here
 * because the SDK may talk to another relay implementation.
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

function parseOp(value: unknown): PreviewOp | null {
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
    const parsed = parseOp(item);
    if (!parsed) return null;
    ops.push(parsed);
  }
  return ops;
}

const MAX_MATCHES_PER_OP = 50;
const MARK_ATTRIBUTE = "data-snag-preview";

export interface PreviewSession {
  /** Ops that matched at least one element on the page. */
  applied: number;
  /** Ops whose selector matched nothing (or was not valid CSS here). */
  skipped: number;
  revert: () => void;
}

function matches(query: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(query))
      .filter((element) => !element.closest("[data-snag-overlay]"))
      .slice(0, MAX_MATCHES_PER_OP);
  } catch {
    return [];
  }
}

function styleSupported(property: string, value: string): boolean {
  if (property.startsWith("--")) return true;
  return typeof CSS === "undefined" || !CSS.supports ? true : CSS.supports(property, value);
}

/** Elements whose children are all text, so replacing the text cannot drop markup. */
function isTextLeaf(element: Element): boolean {
  return Array.from(element.childNodes).every((node) => node.nodeType === Node.TEXT_NODE);
}

/**
 * Apply `ops` to the page until `revert` is called. Style edits live in one
 * temporary stylesheet keyed by a marker attribute; text, move and attribute
 * edits snapshot what they replace. A MutationObserver re-applies edits the
 * host app's own rendering undoes.
 */
export function applyPreview(ops: PreviewOp[]): PreviewSession {
  const styleElement = document.createElement("style");
  styleElement.setAttribute("data-snag-preview-style", "");
  const rules: string[] = [];
  ops.forEach((op, index) => {
    if (op.op === "css") {
      const declarations = Object.entries(op.style)
        .filter(([property, value]) => styleSupported(property, value))
        .map(([property, value]) => `${property}: ${value} !important;`);
      if (declarations.length > 0) {
        rules.push(`[${MARK_ATTRIBUTE}~="${index}"] { ${declarations.join(" ")} }`);
      }
    } else if (op.op === "hide") {
      rules.push(`[${MARK_ATTRIBUTE}~="${index}"] { display: none !important; }`);
    }
  });
  styleElement.textContent = rules.join("\n");
  document.head.appendChild(styleElement);

  const marked = new Map<Element, string | null>();
  const texts = new Map<Element, ChildNode[]>();
  const attributes = new Map<Element, Map<string, string | null>>();
  const moves = new Map<Element, { parent: Node; next: Node | null }>();
  const matchedOps = new Set<number>();

  const mark = (element: Element, index: number) => {
    if (!marked.has(element)) marked.set(element, element.getAttribute(MARK_ATTRIBUTE));
    const tokens = new Set((element.getAttribute(MARK_ATTRIBUTE) ?? "").split(" ").filter(Boolean));
    if (tokens.has(String(index))) return;
    tokens.add(String(index));
    element.setAttribute(MARK_ATTRIBUTE, [...tokens].join(" "));
  };

  const applyAll = () => {
    ops.forEach((op, index) => {
      const found = matches(op.selector);
      if (found.length > 0) matchedOps.add(index);
      for (const element of found) {
        switch (op.op) {
          case "css":
          case "hide":
            mark(element, index);
            break;
          case "text":
            if (!isTextLeaf(element) || element.textContent === op.text) break;
            // Keep the host's latest nodes so revert shows what it rendered last.
            texts.set(element, Array.from(element.childNodes));
            element.textContent = op.text;
            break;
          case "attr": {
            if (element.getAttribute(op.name) === op.value) break;
            const saved = attributes.get(element) ?? new Map<string, string | null>();
            if (!saved.has(op.name)) saved.set(op.name, element.getAttribute(op.name));
            attributes.set(element, saved);
            element.setAttribute(op.name, op.value);
            break;
          }
          case "move": {
            const anchorQuery = "before" in op ? op.before : op.after;
            const anchor = matches(anchorQuery)[0];
            // Only reorder siblings: moving nodes across parents fights the host's renderer.
            if (!anchor || anchor === element || anchor.parentNode !== element.parentNode) break;
            const parent = element.parentNode;
            if (!parent) break;
            const target = "before" in op ? anchor : anchor.nextSibling;
            if (target === element || element.nextSibling === target) break;
            if (!moves.has(element)) moves.set(element, { parent, next: element.nextSibling });
            parent.insertBefore(element, target);
            break;
          }
        }
      }
    });
  };

  let applying = false;
  const run = () => {
    applying = true;
    try {
      applyAll();
    } finally {
      observer.takeRecords();
      applying = false;
    }
  };

  let frame = 0;
  const observer = new MutationObserver(() => {
    if (applying || frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      run();
    });
  });
  run();
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", ...PREVIEW_ATTRIBUTES],
  });

  return {
    applied: matchedOps.size,
    skipped: ops.length - matchedOps.size,
    revert: () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      styleElement.remove();
      for (const [element, previous] of marked) {
        if (previous === null) element.removeAttribute(MARK_ATTRIBUTE);
        else element.setAttribute(MARK_ATTRIBUTE, previous);
      }
      for (const [element, nodes] of texts) element.replaceChildren(...nodes);
      for (const [element, saved] of attributes) {
        for (const [name, value] of saved) {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }
      }
      for (const [element, { parent, next }] of [...moves].reverse()) {
        if (next && next.parentNode === parent) parent.insertBefore(element, next);
        else if (element.parentNode === parent) parent.appendChild(element);
      }
    },
  };
}
