import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { markerFromContext } from "./request_marker.ts";

Deno.test("markerFromContext returns only a valid marker", () => {
  const marker = { pathname: "/settings", selector: "#save", x: 120, y: 480 };
  assertEquals(
    markerFromContext({ route: "/settings", snag_marker: { ...marker, extra: "dropped" } }),
    marker,
  );
  assertEquals(markerFromContext({ route: "/settings" }), null);
  assertEquals(markerFromContext({ snag_marker: { pathname: "", x: 1, y: 2 } }), null);
  assertEquals(markerFromContext({ snag_marker: { pathname: "/a", x: "1", y: 2 } }), null);
  assertEquals(markerFromContext(null), null);
});
