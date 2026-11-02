/// <reference lib="dom" />
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";

import { CONFIG_ELEMENT_ID, readPageConfig } from "./src/page-config.ts";

function documentWithConfig(json: string): Document {
  const parsed = new DOMParser().parseFromString(
    `<html><body><script id="${CONFIG_ELEMENT_ID}" type="application/json">${json}</script></body></html>`,
    "text/html",
  );
  return parsed as unknown as Document;
}

Deno.test("readPageConfig keeps locale when the page config sets it", () => {
  const page = readPageConfig(
    documentWithConfig(
      JSON.stringify({
        endpoint: "https://relay.example.com/functions/v1/relay",
        projectKey: "snag_pk_test",
        locale: "ar",
      }),
    ),
  );
  assertEquals(page?.locale, "ar");
});

Deno.test("readPageConfig omits locale when the page config does not set it", () => {
  const page = readPageConfig(
    documentWithConfig(
      JSON.stringify({
        endpoint: "https://relay.example.com/functions/v1/relay",
        projectKey: "snag_pk_test",
      }),
    ),
  );
  assertEquals(page?.locale, undefined);
});
