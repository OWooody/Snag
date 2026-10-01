import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ChangedFile,
  evaluatePolicy,
  matchGlob,
  migrationIsRisky,
  type PolicyInput,
  type PolicyRule,
  strictestOutcome,
} from "./policy.ts";
import { parseSnagPlan, SNAG_PLAN_HEADING } from "./plan_block.ts";

function files(...paths: string[]): ChangedFile[] {
  return paths.map((path) => ({ path, status: "modified" as const }));
}

function input(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    stage: "plan",
    files: files("src/copy/home.json"),
    linesChanged: null,
    risk: "low",
    flags: [],
    planFiles: null,
    planMissing: false,
    editedDuringPlanning: false,
    requester: { id: "pm@example.com", verified: true, trusted: true },
    rules: [],
    defaultOutcome: "review_before_execution",
    delivery: "pr_only",
    projectShadow: false,
    now: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

const allowCopy: PolicyRule = {
  id: "r-allow",
  name: "Copy files",
  enabled: true,
  shadow: false,
  kind: "allow",
  outcome: "execute",
  condition: { all: [{ type: "path_glob_all", globs: ["src/copy/**"] }] },
};

const escalateLarge: PolicyRule = {
  id: "r-large",
  name: "Large change",
  enabled: true,
  shadow: false,
  kind: "escalate",
  outcome: "review_before_merge",
  condition: { all: [{ type: "max_files", max: 2 }] },
};

Deno.test("matchGlob handles **, *, and bare file names", () => {
  assert(matchGlob("src/**", "src/a/b.ts"));
  assert(matchGlob("**/package.json", "package.json"));
  assert(matchGlob("**/package.json", "apps/web/package.json"));
  assert(matchGlob("src/*.ts", "src/a.ts"));
  assert(!matchGlob("src/*.ts", "src/a/b.ts"));
  assert(matchGlob("package.json", "apps/web/package.json"));
  assert(matchGlob(".github/**", ".github/workflows/ci.yml"));
  assert(!matchGlob("src/copy/**", "src/copyright.ts"));
});

Deno.test("strictestOutcome picks the most restrictive", () => {
  assertEquals(strictestOutcome(), "execute");
  assertEquals(
    strictestOutcome("execute", "review_before_execution", "review_before_merge"),
    "review_before_execution",
  );
});

Deno.test("no rules falls back to the default outcome", () => {
  const decision = evaluatePolicy(input());
  assertEquals(decision.outcome, "review_before_execution");
});

Deno.test("allow rule lifts the outcome to execute", () => {
  const decision = evaluatePolicy(input({ rules: [allowCopy] }));
  assertEquals(decision.outcome, "execute");
  assertEquals(decision.matched.map((rule) => rule.id), ["r-allow"]);
});

Deno.test("escalations never relax below the default", () => {
  const decision = evaluatePolicy(
    input({
      files: files("a.ts", "b.ts", "c.ts"),
      rules: [escalateLarge],
    }),
  );
  assertEquals(decision.outcome, "review_before_execution");
});

Deno.test("escalation beats a matching allow rule", () => {
  const decision = evaluatePolicy(
    input({
      files: files("src/copy/a.json", "src/copy/b.json", "src/copy/c.json"),
      rules: [allowCopy, escalateLarge],
    }),
  );
  assertEquals(decision.outcome, "review_before_merge");
});

Deno.test("disabled rules are ignored", () => {
  const decision = evaluatePolicy(
    input({ rules: [{ ...allowCopy, enabled: false }] }),
  );
  assertEquals(decision.outcome, "review_before_execution");
});

Deno.test("shadow rules are recorded but not enforced", () => {
  const decision = evaluatePolicy(
    input({ rules: [{ ...allowCopy, shadow: true }] }),
  );
  assertEquals(decision.outcome, "review_before_execution");
  assertEquals(decision.shadow_outcome, "execute");
  assertEquals(decision.matched[0].shadow, true);
});

Deno.test("project shadow mode routes everything to developer approval", () => {
  const decision = evaluatePolicy(
    input({ rules: [allowCopy], projectShadow: true }),
  );
  assertEquals(decision.computed_outcome, "execute");
  assertEquals(decision.outcome, "review_before_execution");
});

Deno.test("missing plan always waits for a developer", () => {
  const decision = evaluatePolicy(
    input({ rules: [allowCopy], planMissing: true, files: [] }),
  );
  assertEquals(decision.outcome, "review_before_execution");
  assert(decision.matched.some((rule) => rule.id === "builtin:plan_missing"));
});

Deno.test("malformed escalate condition fails closed, malformed allow does not match", () => {
  const brokenEscalate: PolicyRule = {
    ...escalateLarge,
    id: "broken-escalate",
    condition: { all: [{ type: "unknown" }] },
  };
  const brokenAllow: PolicyRule = {
    ...allowCopy,
    id: "broken-allow",
    condition: { nope: true },
  };
  const decision = evaluatePolicy(
    input({ rules: [brokenAllow, brokenEscalate], defaultOutcome: "execute" }),
  );
  assertEquals(decision.outcome, "review_before_merge");
  assertEquals(decision.matched.map((rule) => rule.id), ["broken-escalate"]);
});

Deno.test("merge deliveries escalate CI config, dependencies, and edited tests", () => {
  const base = input({
    stage: "diff",
    rules: [{
      ...allowCopy,
      condition: { all: [{ type: "path_glob_any", globs: ["**"] }] },
    }],
    delivery: "preview_confirm",
  });

  assertEquals(
    evaluatePolicy({ ...base, files: files(".github/workflows/ci.yml") }).outcome,
    "review_before_merge",
  );
  assertEquals(
    evaluatePolicy({ ...base, files: files("apps/web/package.json") }).outcome,
    "review_before_merge",
  );
  assertEquals(
    evaluatePolicy({ ...base, files: files("src/header.test.tsx") }).outcome,
    "review_before_merge",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      files: [{ path: "src/header.test.tsx", status: "added" }],
    }).outcome,
    "execute",
  );
  assertEquals(
    evaluatePolicy({ ...base, delivery: "pr_only", files: files("package.json") })
      .outcome,
    "execute",
  );
});

Deno.test("diff stage escalates files outside the plan and maps review_before_execution", () => {
  const decision = evaluatePolicy(
    input({
      stage: "diff",
      files: files("src/copy/home.json", "src/app.tsx"),
      planFiles: ["src/copy/home.json"],
      rules: [{
        ...allowCopy,
        condition: { all: [{ type: "path_glob_any", globs: ["src/**"] }] },
      }],
    }),
  );
  assertEquals(decision.outcome, "review_before_merge");
  assert(decision.matched.some((rule) => rule.id === "builtin:outside_plan"));

  const noAllow = evaluatePolicy(input({ stage: "diff" }));
  assertEquals(noAllow.outcome, "review_before_merge");
});

Deno.test("auto_merge requires an allow rule and a verified, trusted requester", () => {
  const withAllow = evaluatePolicy(
    input({ delivery: "auto_merge", rules: [allowCopy] }),
  );
  assertEquals(withAllow.outcome, "execute");

  const defaultExecute = evaluatePolicy(
    input({ delivery: "auto_merge", defaultOutcome: "execute" }),
  );
  assertEquals(defaultExecute.outcome, "review_before_merge");

  const untrusted = evaluatePolicy(
    input({
      delivery: "auto_merge",
      rules: [allowCopy],
      requester: { id: "x", verified: true, trusted: false },
    }),
  );
  assertEquals(untrusted.outcome, "review_before_merge");
});

Deno.test("risk, flag, size, and requester conditions", () => {
  const rule = (condition: unknown): PolicyRule => ({
    ...escalateLarge,
    id: "c",
    outcome: "review_before_execution",
    condition: { all: [condition] },
  });
  const base = input({ defaultOutcome: "execute" });

  assertEquals(
    evaluatePolicy({
      ...base,
      risk: "medium",
      rules: [rule({ type: "risk_at_least", level: "medium" })],
    }).outcome,
    "review_before_execution",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      risk: "low",
      rules: [rule({ type: "risk_at_least", level: "medium" })],
    }).outcome,
    "execute",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      flags: ["auth"],
      rules: [rule({ type: "flag", flag: "auth" })],
    }).outcome,
    "review_before_execution",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      rules: [rule({ type: "max_lines", max: 10 })],
    }).outcome,
    "execute",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      stage: "diff",
      linesChanged: 11,
      rules: [rule({ type: "max_lines", max: 10 })],
    }).outcome,
    "review_before_merge",
  );
  assertEquals(
    evaluatePolicy({
      ...base,
      requester: { id: null, verified: false, trusted: false },
      rules: [rule({ type: "requester_unverified" })],
    }).outcome,
    "review_before_execution",
  );
});

Deno.test("edited during planning escalates to review before merge", () => {
  const decision = evaluatePolicy(
    input({ rules: [allowCopy], editedDuringPlanning: true }),
  );
  assertEquals(decision.outcome, "review_before_merge");
});

function migration(sql: string, status: ChangedFile["status"] = "added"): ChangedFile {
  return {
    path: "supabase/migrations/20261001_change.sql",
    status,
    patch: ["@@ -0,0 +1 @@", ...sql.split("\n").map((line) => `+${line}`)].join("\n"),
  };
}

Deno.test("migrationIsRisky allows adding up to N columns", () => {
  assert(!migrationIsRisky([migration("alter table orders add column note text;")], 2));
  assert(
    !migrationIsRisky([
      migration(
        "alter table orders add column note text;\nalter table orders add if not exists tag text;",
      ),
    ], 2),
  );
  assert(
    migrationIsRisky([
      migration(
        "alter table orders add column a text, add column b text, add column c text;",
      ),
    ], 2),
  );
  assert(!migrationIsRisky([migration("create table notes (id uuid primary key, body text);")], 2));
  assert(
    !migrationIsRisky([migration("alter table orders add constraint orders_ref unique (ref);")], 2),
  );
});

Deno.test("migrationIsRisky flags destructive, altering, and permission SQL", () => {
  for (
    const sql of [
      "alter table orders drop column note;",
      "drop table orders;",
      "alter table orders alter column total type numeric;",
      "alter table orders rename column a to b;",
      "truncate orders;",
      "delete from orders where true;",
      "update orders set status = 'x';",
      "grant select on orders to anon;",
      "create policy p on orders for select using (true);",
      "alter table orders disable row level security;",
    ]
  ) {
    assert(migrationIsRisky([migration(sql)], 2), sql);
  }
  assert(!migrationIsRisky([migration("-- drop table later\nalter table o add column n int;")], 2));
});

Deno.test("migrationIsRisky fails closed on edited migrations and missing diffs", () => {
  assert(migrationIsRisky([migration("alter table o add column n int;", "modified")], 2));
  assert(migrationIsRisky([migration("", "removed")], 2));
  assert(
    migrationIsRisky([{ path: "supabase/migrations/1.sql", status: "added", patch: null }], 2),
  );
});

Deno.test("migrationIsRisky treats removed ORM schema lines as risky", () => {
  const prisma = (patch: string): ChangedFile => ({
    path: "prisma/schema.prisma",
    status: "modified",
    patch,
  });
  assert(!migrationIsRisky([prisma("@@ -1,2 +1,3 @@\n model Order {\n+  note String?\n }")], 2));
  assert(migrationIsRisky([prisma("@@ -1,3 +1,2 @@\n model Order {\n-  note String?\n }")], 2));
});

Deno.test("risky_sql and files_removed only match at diff stage", () => {
  const riskySql: PolicyRule = {
    id: "r-sql",
    name: "Risky migration",
    enabled: true,
    shadow: false,
    kind: "escalate",
    outcome: "review_before_merge",
    condition: {
      all: [{ type: "risky_sql", globs: ["**/migrations/**"], max_added_columns: 2 }],
    },
  };
  const removed: PolicyRule = {
    ...riskySql,
    id: "r-removed",
    name: "Deletes files",
    condition: { all: [{ type: "files_removed" }] },
  };
  const allowAll: PolicyRule = {
    ...allowCopy,
    condition: { all: [{ type: "path_glob_any", globs: ["**"] }] },
  };
  const drop = migration("alter table orders drop column note;");

  assertEquals(
    evaluatePolicy(input({ files: [drop], rules: [allowAll, riskySql, removed] })).outcome,
    "execute",
  );
  assertEquals(
    evaluatePolicy(input({ stage: "diff", files: [drop], rules: [allowAll, riskySql] }))
      .outcome,
    "review_before_merge",
  );
  assertEquals(
    evaluatePolicy(
      input({
        stage: "diff",
        files: [migration("alter table orders add column note text;")],
        rules: [allowAll, riskySql, removed],
      }),
    ).outcome,
    "execute",
  );
  assertEquals(
    evaluatePolicy(
      input({
        stage: "diff",
        files: [{ path: "src/old.ts", status: "removed" }],
        rules: [allowAll, removed],
      }),
    ).outcome,
    "review_before_merge",
  );
});

Deno.test("parseSnagPlan mirrors the shared parser", () => {
  const summary = [
    "Plan",
    SNAG_PLAN_HEADING,
    "```json",
    '{"files":["./src/a.ts","src/a.ts"],"risk":"medium","flags":["auth","x"]}',
    "```",
  ].join("\n");
  assertEquals(parseSnagPlan(summary), {
    files: ["src/a.ts"],
    risk: "medium",
    flags: ["auth"],
    summary: null,
  });
  assertEquals(parseSnagPlan("no plan"), null);
});
