import assert from "node:assert/strict";
import { test } from "node:test";
import { forgeHostFromRepoUrl, repoUrlSchema } from "../dist/index.js";

test("repository URLs accept GitHub and Cursor Origin", () => {
  assert.equal(forgeHostFromRepoUrl("https://github.com/acme/web"), "github");
  assert.equal(forgeHostFromRepoUrl("https://origin.cursor.com/acme/web.git"), "origin");
  assert.equal(forgeHostFromRepoUrl("https://cursor.com/codebase/acme/web"), "origin");
  assert.equal(forgeHostFromRepoUrl("https://gitlab.com/acme/web"), null);
  assert.equal(repoUrlSchema.safeParse("https://github.com/acme/web").success, true);
  assert.equal(repoUrlSchema.safeParse("https://origin.cursor.com/acme/web").success, true);
  assert.equal(repoUrlSchema.safeParse("https://gitlab.com/acme/web").success, false);
});
