import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { PickedElement } from "../element-highlights";
import type { SnagRequestMarker, SnagRequestRow, SnagRequestStatus } from "../protocol";
import type { SnagTheme } from "../theme";

const MARKER_SIZE = 22;
const CLOSED_STATUSES: ReadonlySet<SnagRequestStatus> = new Set([
  "finished",
  "error",
  "merged",
  "rejected",
]);

/** Marker for a new request: the top-right corner of the first picked element. */
export function markerFor(elements: PickedElement[]): SnagRequestMarker | undefined {
  const first = elements[0];
  if (!first) return undefined;
  const rect = first.element.isConnected
    ? first.element.getBoundingClientRect()
    : { right: first.info.rect.x + first.info.rect.width, top: first.info.rect.y };
  return {
    pathname: window.location.pathname,
    selector: first.info.selector,
    x: Math.round(rect.right + window.scrollX),
    y: Math.round(rect.top + window.scrollY),
  };
}

const LOCATION_EVENT = "snag:locationchange";
let historyPatched = false;

/** Single-page apps change the URL through history without a popstate event. */
function patchHistory() {
  if (historyPatched) return;
  historyPatched = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOCATION_EVENT));
      return result;
    };
  }
}

function subscribeLocation(onChange: () => void): () => void {
  patchHistory();
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  window.addEventListener(LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(LOCATION_EVENT, onChange);
  };
}

function usePathname(): string {
  return useSyncExternalStore(
    subscribeLocation,
    () => window.location.pathname,
    () => "/",
  );
}

interface PlacedMarker {
  row: SnagRequestRow;
  number: number;
  left: number;
  top: number;
}

function resolveElement(selector: string | undefined): Element | null | undefined {
  if (!selector) return undefined;
  try {
    return document.querySelector(selector);
  } catch {
    return undefined;
  }
}

function place(rows: SnagRequestRow[]): PlacedMarker[] {
  const taken = new Map<string, number>();
  const placed: PlacedMarker[] = [];
  rows.forEach((row, index) => {
    const marker = row.marker!;
    const element = resolveElement(marker.selector);
    let x = marker.x - window.scrollX;
    let y = marker.y - window.scrollY;
    if (element) {
      const rect = element.getBoundingClientRect();
      // A matched element that is hidden right now (closed menu, other tab) gets no marker.
      if (rect.width === 0 && rect.height === 0) return;
      x = rect.right;
      y = rect.top;
    }
    const key = `${Math.round(x / MARKER_SIZE)}:${Math.round(y / MARKER_SIZE)}`;
    const stacked = taken.get(key) ?? 0;
    taken.set(key, stacked + 1);
    placed.push({
      row,
      number: index + 1,
      left: x - MARKER_SIZE / 2 - stacked * (MARKER_SIZE - 6),
      top: y - MARKER_SIZE / 2,
    });
  });
  return placed;
}

/**
 * Numbered pins where open requests on this page were filed, so people see
 * what's already asked for before filing it again. Follows scroll, resize,
 * layout shifts, and client-side navigation.
 */
export function PageMarkers({
  rows,
  theme,
  onOpen,
}: {
  rows: SnagRequestRow[];
  theme: SnagTheme;
  onOpen: (row: SnagRequestRow) => void;
}) {
  const pathname = usePathname();
  const visible = useMemo(
    () =>
      rows.filter(
        (row) => row.marker?.pathname === pathname && !CLOSED_STATUSES.has(row.status),
      ),
    [rows, pathname],
  );
  const [placed, setPlaced] = useState<PlacedMarker[]>([]);

  useEffect(() => {
    if (visible.length === 0) {
      setPlaced([]);
      return;
    }
    let frame = 0;
    const layout = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setPlaced(place(visible));
      });
    };
    layout();
    window.addEventListener("scroll", layout, { capture: true, passive: true });
    window.addEventListener("resize", layout);
    // Content loading in or rearranging moves elements without a scroll or resize.
    const interval = window.setInterval(layout, 1000);
    return () => {
      window.removeEventListener("scroll", layout, { capture: true });
      window.removeEventListener("resize", layout);
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [visible]);

  return (
    <>
      {placed.map(({ row, number, left, top }) => (
        <button
          key={row.id}
          type="button"
          className="snag-focus snag-page-marker"
          onClick={() => onOpen(row)}
          aria-label={`Open request ${number}: ${row.prompt}`}
          title={row.prompt.length > 120 ? `${row.prompt.slice(0, 117)}…` : row.prompt}
          style={{
            position: "fixed",
            left,
            top,
            zIndex: 2147483645,
            width: MARKER_SIZE,
            height: MARKER_SIZE,
            padding: 0,
            borderRadius: "50% 50% 50% 4px",
            border: "2px solid #fff",
            background: theme.accent,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: `${MARKER_SIZE - 4}px`,
            textAlign: "center",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {number}
        </button>
      ))}
    </>
  );
}
