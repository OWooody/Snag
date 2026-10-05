/**
 * Where a request was filed on the page, so the SDK can pin a marker there.
 * Stored in the request context as `snag_marker`; only this shape is ever
 * returned to clients, never the rest of the context.
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);

export const requestMarkerSchema = z.object({
  pathname: z.string().min(1).max(500),
  selector: z.string().min(1).max(500).optional(),
  /** Page coordinates in CSS px, used when the selector no longer matches. */
  x: coordinate,
  y: coordinate,
});

export type RequestMarker = z.infer<typeof requestMarkerSchema>;

export const MARKER_CONTEXT_KEY = "snag_marker";

export function markerFromContext(context: unknown): RequestMarker | null {
  if (!context || typeof context !== "object") return null;
  const parsed = requestMarkerSchema.safeParse(
    (context as Record<string, unknown>)[MARKER_CONTEXT_KEY],
  );
  return parsed.success ? parsed.data : null;
}
