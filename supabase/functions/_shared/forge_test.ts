import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseForgePullRequestUrl,
  parseForgeRepoUrl,
  pullRequestUrl,
  sameRepo,
} from "./forge.ts";

Deno.test("repository URLs accept GitHub and Origin", () => {
  assertEquals(parseForgeRepoUrl("https://github.com/acme/web"), {
    host: "github",
    owner: "acme",
    repo: "web",
  });
  assertEquals(parseForgeRepoUrl("https://github.com/acme/web.git"), {
    host: "github",
    owner: "acme",
    repo: "web",
  });
  assertEquals(parseForgeRepoUrl("https://origin.cursor.com/acme/web"), {
    host: "origin",
    owner: "acme",
    repo: "web",
  });
  assertEquals(parseForgeRepoUrl("https://cursor.com/codebase/acme/web"), {
    host: "origin",
    owner: "acme",
    repo: "web",
  });
  assertEquals(parseForgeRepoUrl("https://gitlab.com/acme/web"), null);
});

Deno.test("pull request URLs keep the host", () => {
  assertEquals(
    parseForgePullRequestUrl("https://github.com/acme/web/pull/7"),
    { host: "github", owner: "acme", repo: "web", number: 7 },
  );
  assertEquals(
    parseForgePullRequestUrl("https://origin.cursor.com/acme/web/pull/7"),
    { host: "origin", owner: "acme", repo: "web", number: 7 },
  );
  assertEquals(
    parseForgePullRequestUrl("https://origin.cursor.com/acme/web/pulls/8"),
    { host: "origin", owner: "acme", repo: "web", number: 8 },
  );
  assertEquals(
    pullRequestUrl("origin", { owner: "acme", repo: "web" }, 7),
    "https://origin.cursor.com/acme/web/pull/7",
  );
  const parsed = parseForgePullRequestUrl("https://github.com/acme/web/pull/7")!;
  assertEquals(sameRepo(parsed, "origin", { owner: "acme", repo: "web" }), false);
  assertEquals(sameRepo(parsed, "github", { owner: "acme", repo: "web" }), true);
});
