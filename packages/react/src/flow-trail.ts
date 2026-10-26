import { redactPath, sanitizeLabel, stepsForRequest } from "./flow-steps";
import type { SnagFlowStep } from "./protocol";

const CLICKABLE =
  "button, a, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem']";

/**
 * Ring buffer of recent navigations and control activations.
 * Recording pauses while the request sheet is open, so picking an element
 * or using the sheet does not become part of the trail.
 */
let steps: SnagFlowStep[] = [];
let paused = false;
let installed = false;
let restore: (() => void) | null = null;

function push(step: SnagFlowStep): void {
  const last = steps[steps.length - 1];
  if (last && last.type === step.type && last.path === step.path && last.label === step.label) {
    return;
  }
  steps.push(step);
  if (steps.length > 8) steps.shift();
}

function recordNavigate(pathname: string): void {
  if (paused) return;
  const path = redactPath(pathname);
  if (!path) return;
  push({ type: "navigate", path });
}

function visibleText(element: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      !parent.closest("input, textarea, select, script, style, [contenteditable='true']")
    ) {
      parts.push(node.textContent ?? "");
    }
    node = walker.nextNode();
    if (parts.join(" ").length > 80) break;
  }
  return parts.join(" ");
}

/**
 * Control name only. Never reads input values, href, src, title, or placeholder.
 * Link text is skipped: a link's visible text is often a person, address, or
 * document title. aria-label and data-testid still count for links.
 */
function labelFor(element: Element): string | null {
  const testId =
    element.getAttribute("data-testid") ??
    element.getAttribute("data-test") ??
    element.getAttribute("data-cy");
  if (testId) {
    const safe = sanitizeLabel(testId);
    if (safe && /^[A-Za-z][\w:.-]*$/.test(safe)) return safe;
  }
  const aria = element.getAttribute("aria-label");
  if (aria) {
    const safe = sanitizeLabel(aria);
    if (safe) return safe;
  }
  const isLink = element.tagName === "A" || element.getAttribute("role") === "link";
  if (isLink) return null;
  return sanitizeLabel(visibleText(element));
}

function clickableFrom(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (
    target.closest(
      "[data-snag-overlay], input, textarea, select, option, [contenteditable='true']",
    )
  ) {
    return null;
  }
  const element = target.closest(CLICKABLE);
  if (!(element instanceof Element)) return null;
  if (element.closest("[data-snag-overlay]")) return null;
  if (element.querySelector("input, textarea, select")) return null;
  return element;
}

function onClick(event: MouseEvent): void {
  if (paused || !event.isTrusted || event.button !== 0) return;
  const element = clickableFrom(event.target);
  if (!element) return;
  const label = labelFor(element);
  if (!label) return;
  const path = redactPath(window.location.pathname);
  if (!path) return;
  push({ type: "click", path, label });
}

/** Start recording. Returns a stop function. Safe to call once per enabled overlay. */
export function startFlowTrail(): () => void {
  if (installed && restore) return restore;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  installed = true;
  steps = [];
  paused = false;
  let active = true;

  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  const wrappedPush = function (this: History, ...args: Parameters<History["pushState"]>) {
    const result = originalPush.apply(this, args);
    if (active) recordNavigate(window.location.pathname);
    return result;
  };
  const wrappedReplace = function (
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    const result = originalReplace.apply(this, args);
    if (active) recordNavigate(window.location.pathname);
    return result;
  };
  window.history.pushState = wrappedPush;
  window.history.replaceState = wrappedReplace;
  const onPop = () => {
    if (active) recordNavigate(window.location.pathname);
  };
  window.addEventListener("popstate", onPop);
  document.addEventListener("livewire:navigated", onPop);
  document.addEventListener("click", onClick, true);
  recordNavigate(window.location.pathname);

  restore = () => {
    if (!installed) return;
    installed = false;
    active = false;
    // Leave the wrapper in place when a later patch (page markers) wrapped it,
    // so that patch's chain still reaches the native methods.
    if (window.history.pushState === wrappedPush) window.history.pushState = originalPush;
    if (window.history.replaceState === wrappedReplace) {
      window.history.replaceState = originalReplace;
    }
    window.removeEventListener("popstate", onPop);
    document.removeEventListener("livewire:navigated", onPop);
    document.removeEventListener("click", onClick, true);
    steps = [];
    paused = false;
    restore = null;
  };
  return restore;
}

export function setFlowTrailPaused(next: boolean): void {
  paused = next;
}

/** Copy of the trail worth attaching. Does not clear the buffer. */
export function snapshotFlowTrail(): SnagFlowStep[] {
  return stepsForRequest(steps);
}
