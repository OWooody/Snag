import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SnagOverlay } from "./components/snag-overlay";
import { getSnagConfig, initSnag, type SnagConfig } from "./config";
import {
  CONFIG_ELEMENT_ID,
  readPageConfig,
  type SnagPageConfig,
} from "./page-config";

/**
 * Script-tag build for server-rendered apps (Laravel, Filament, Livewire, ...).
 * Boots from `<script id="snag-config" type="application/json">` and mounts
 * the overlay into `#snag-root`. Exposed as `window.Snag`.
 */

export { CONFIG_ELEMENT_ID, readPageConfig };
export type { SnagPageConfig };

export const ROOT_ELEMENT_ID = "snag-root";

let root: Root | null = null;
let container: Element | null = null;

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
    locale: page.locale,
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
    const next = readPageConfig();
    if (next && (!root || next.locale !== getSnagConfig()?.locale)) init(next);
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
