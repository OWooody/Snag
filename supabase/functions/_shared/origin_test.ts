import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { originClient, signOriginAppJwt } from "./origin.ts";

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const bytes = new Uint8Array(pkcs8);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

Deno.test("origin app jwt is an EdDSA token for that app", async () => {
  const key = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  if (!("privateKey" in key)) throw new Error("expected an Ed25519 key pair");
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key.privateKey);
  const jwt = await signOriginAppJwt("app_test", pemFromPkcs8(pkcs8));
  const [headerPart, payloadPart, signature] = jwt.split(".");
  assertEquals(Boolean(signature), true);
  const header = JSON.parse(decode(headerPart));
  const payload = JSON.parse(decode(payloadPart));
  assertEquals(header.alg, "EdDSA");
  assertEquals(header.kid, "app_test");
  assertEquals(payload.iss, "app_test");
  assertEquals(payload.aud, "origin-apps");
});

Deno.test("origin client maps a pull request and squash-merges", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    if (url.endsWith("/pulls/17/merge")) {
      return Promise.resolve(Response.json({ mergeCommitSha: "abc123" }));
    }
    if (url.endsWith("/pulls/17/files?pageSize=100")) {
      return Promise.resolve(Response.json({
        files: [{
          filename: "src/app.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          patch: "@@ -1 +1 @@",
        }],
      }));
    }
    if (url.includes("/check-runs")) {
      return Promise.resolve(Response.json({
        checkRuns: [
          { status: "completed", conclusion: "success" },
          { status: "in_progress", conclusion: null },
        ],
      }));
    }
    if (url.endsWith("/pulls/17")) {
      return Promise.resolve(Response.json({
        id: "pr_17",
        number: "17",
        state: "open",
        draft: false,
        merged: false,
        title: "Add telemetry",
        head: { ref: "refs/heads/feature", sha: "headsha" },
        base: { ref: "main", sha: "basesha" },
        version: {
          headSha: "headsha",
          potentialMergeCommit: { state: "prepared" },
        },
      }));
    }
    return Promise.resolve(new Response("missing", { status: 404 }));
  };

  try {
    const client = originClient({ token: "oit_test" });
    const repo = { owner: "acme", repo: "web" };
    const pr = await client.getPullRequest(repo, 17);
    assertEquals(pr.number, 17);
    assertEquals(pr.headRef, "feature");
    assertEquals(pr.headSha, "headsha");
    assertEquals(pr.mergeable, true);

    const diff = await client.getPullRequestDiff(repo, 17);
    assertEquals(diff.files[0]?.path, "src/app.ts");
    assertEquals(diff.linesChanged, 3);

    assertEquals(await client.getChecksState(repo, "headsha"), "pending");
    assertEquals(await client.findPreviewUrl(repo, "headsha"), null);

    const merged = await client.squashMerge(repo, 17, { sha: "headsha", title: "Add telemetry" });
    assertEquals(merged, { merged: true, sha: "abc123" });
    const mergeCall = calls.find((call) => call.url.endsWith("/merge"));
    assertEquals(mergeCall?.method, "POST");
    assertEquals(JSON.parse(mergeCall?.body ?? "{}"), {
      expectedHeadSha: "headsha",
      mergeMethod: "squash",
    });
  } finally {
    globalThis.fetch = original;
  }
});

function decode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (segment.length % 4)) % 4);
  return atob(padded);
}
