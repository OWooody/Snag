import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SnagOverlay } from "./components/snag-overlay";
import { initSnag, type SnagConfig } from "./config";
import type { SnagTheme } from "./theme";

/**
 * Script-tag build for server-rendered apps (Laravel, Filament, Livewire, ...).
 * Boots from `<script id="snag-config" type="application/json">` and mounts
 * the overlay into `#snag-root`. Exposed as `window.Snag`.
 */

export interface SnagPageConfig {
  endpoint: string;
  projectKey: string;
  requester?: string | null;
  context?: Record<string, unknown>;
  markers?: boolean;
  debug?: boolean;
  theme?: Partial<SnagTheme>;
}

export const CONFIG_ELEMENT_ID = "snag-config";
export const ROOT_ELEMENT_ID = "snag-root";

let root: Root | null = null;
let container: Element | null = null;

/** Parse the server-written page config; null when absent or invalid. */
export function readPageConfig(doc: Document = document): SnagPageConfig | null {
  const element = doc.getElementById(CONFIG_ELEMENT_ID);
  if (!element?.textContent) return null;
  try {
    const parsed: unknown = JSON.parse(element.textContent);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<SnagPageConfig>;
    if (typeof value.endpoint !== "string" || !value.endpoint) return null;
    if (typeof value.projectKey !== "string" || !value.projectKey) return null;
    return value as SnagPageConfig;
  } catch {
    return null;
  }
}

/**
 * Configure Snag. Requester and context are re-read from the page config on
 * every request, so pages swapped in by `wire:navigate` report their own route.
 */
export function init(page: SnagPageConfig, extra: Partial<SnagConfig> = {}): void {
  initSnag({
    endpoint: page.endpoint,
    projectKey: page.projectKey,
    markers: page.markers,
    debug: page.debug,
    theme: page.theme,
    getRequester: () => (readPageConfig() ?? page).requester ?? null,
    getContext: () => (readPageConfig() ?? page).context ?? {},
    ...extra,
  });
}

function resolveContainer(): Element {
  const existing = document.getElementById(ROOT_ELEMENT_ID);
  if (existing) return existing;
  const created = document.createElement("div");
  created.id = ROOT_ELEMENT_ID;
  document.body.appendChild(created);
  return created;
}

/** Mount the overlay once. Calling it again while mounted is a no-op. */
export function mount(): void {
  if (root && container?.isConnected) return;
  if (root) unmount();
  container = resolveContainer();
  const host = document.createElement("div");
  root = createRoot(host);
  root.render(createElement(SnagOverlay, { container }));
}

export function unmount(): void {
  root?.unmount();
  root = null;
  container = null;
}

export function isMounted(): boolean {
  return root != null;
}

/**
 * After `wire:navigate`, Livewire moves the persisted `#snag-root` into the new
 * page. Remount only when it did not (page without Snag, or no persist marker).
 */
function onNavigated(): void {
  if (container?.isConnected) return;
  if (!readPageConfig()) {
    unmount();
    return;
  }
  mount();
}

function boot(): void {
  const page = readPageConfig();
  if (page) {
    init(page);
    mount();
  }
  document.addEventListener("livewire:navigated", () => {
    if (!root) {
      const next = readPageConfig();
      if (!next) return;
      init(next);
    }
    onNavigated();
  });
}

declare global {
  interface Window {
    __snagBooted?: boolean;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__snagBooted) {
  window.__snagBooted = true;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
