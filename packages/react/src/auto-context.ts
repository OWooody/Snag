const MAX_UA_LENGTH = 180;
const MAX_CONSOLE_ERRORS = 5;
const MAX_CONSOLE_ERROR_LENGTH = 200;
const MAX_CONTEXT_JSON_LENGTH = 4000;

const consoleErrors: string[] = [];
let consolePatched = false;
let originalConsoleError: typeof console.error | null = null;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function stringifyConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message || arg.name;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/** Start buffering recent `console.error` messages for `snag_auto.consoleErrors`. */
export function startConsoleErrorBuffer(): () => void {
  if (typeof console === "undefined" || consolePatched) {
    return () => undefined;
  }
  originalConsoleError = console.error.bind(console);
  consolePatched = true;
  console.error = (...args: unknown[]) => {
    const message = truncate(
      args.map(stringifyConsoleArg).join(" "),
      MAX_CONSOLE_ERROR_LENGTH,
    );
    if (message) {
      consoleErrors.push(message);
      if (consoleErrors.length > MAX_CONSOLE_ERRORS) {
        consoleErrors.shift();
      }
    }
    originalConsoleError?.(...(args as Parameters<typeof console.error>));
  };
  return () => {
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
    originalConsoleError = null;
    consolePatched = false;
    consoleErrors.length = 0;
  };
}

export function buildAutoContext(): Record<string, unknown> {
  if (typeof window === "undefined") return {};

  const auto: Record<string, unknown> = {
    url: window.location.href.split("#")[0],
    pathname: window.location.pathname,
    search: window.location.search,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    userAgent: truncate(navigator.userAgent ?? "", MAX_UA_LENGTH),
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  if (consoleErrors.length > 0) {
    auto.consoleErrors = [...consoleErrors];
  }

  return auto;
}

/**
 * Merge auto-captured browser context with host `getContext`. Host top-level
 * keys win. If the JSON would exceed the relay cap, drop `consoleErrors` first.
 */
export function mergeContext(
  hostContext: Record<string, unknown>,
): Record<string, unknown> {
  const snag_auto = buildAutoContext();
  let merged: Record<string, unknown> = { snag_auto, ...hostContext };

  if (JSON.stringify(merged).length <= MAX_CONTEXT_JSON_LENGTH) {
    return merged;
  }

  const { consoleErrors: _dropped, ...autoWithoutConsole } = snag_auto as {
    consoleErrors?: string[];
  } & Record<string, unknown>;
  merged = { snag_auto: autoWithoutConsole, ...hostContext };

  if (JSON.stringify(merged).length <= MAX_CONTEXT_JSON_LENGTH) {
    return merged;
  }

  // Last resort: keep host context only (still may be rejected by relay).
  return hostContext;
}
