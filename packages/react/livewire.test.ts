/// <reference lib="dom" />
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.48/deno-dom-wasm.ts";
import { elementLabel, readLivewireInfo } from "./src/element-info.ts";

function snapshot(name: string): string {
  return JSON.stringify({ data: { secret: "x" }, memo: { id: "abc", name } }).replace(/"/g, "&quot;");
}

const document = new DOMParser().parseFromString(`
  <body>
    <div wire:id="outer" wire:snapshot="${snapshot("filament.livewire.notifications")}">
      <div wire:id="page" wire:snapshot="${snapshot("app.filament.resources.user-resource.pages.edit-user")}">
        <form><button id="save">Save</button></form>
        <div wire:id="broken" wire:snapshot="{not json"><span id="inside-broken">x</span></div>
      </div>
    </div>
    <p id="plain">No Livewire here</p>
  </body>
`, "text/html");

type DomElement = Parameters<typeof readLivewireInfo>[0];
const byId = (id: string) => document.getElementById(id) as unknown as DomElement;

Deno.test("readLivewireInfo returns the nearest component and its ancestors", () => {
  const info = readLivewireInfo(byId("save"));
  assertEquals(info, {
    livewire: {
      component: "app.filament.resources.user-resource.pages.edit-user",
      stack: [
        "app.filament.resources.user-resource.pages.edit-user",
        "filament.livewire.notifications",
      ],
    },
  });
  assert(!JSON.stringify(info).includes("secret"));
});

Deno.test("readLivewireInfo skips malformed snapshots and falls back to the runtime", () => {
  assertEquals(
    readLivewireInfo(byId("inside-broken")).livewire?.component,
    "app.filament.resources.user-resource.pages.edit-user",
  );

  const globals = globalThis as { Livewire?: unknown };
  globals.Livewire = { find: (id: string) => (id === "broken" ? { name: "app.livewire.broken" } : undefined) };
  try {
    assertEquals(
      readLivewireInfo(byId("inside-broken")).livewire?.component,
      "app.livewire.broken",
    );
  } finally {
    delete globals.Livewire;
  }
});

Deno.test("readLivewireInfo returns nothing outside Livewire", () => {
  assertEquals(readLivewireInfo(byId("plain")), {});
});

Deno.test("elementLabel prefers React, then the short Livewire name", () => {
  const livewire = { component: "app.filament.resources.user-resource.pages.edit-user" };
  assertEquals(elementLabel({ tag: "button", text: "Save", livewire }), '<button> "Save" · edit-user');
  assertEquals(
    elementLabel({ tag: "button", component: "SaveButton", livewire }),
    "<button> · SaveButton",
  );
});
