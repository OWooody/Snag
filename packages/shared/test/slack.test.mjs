import assert from "node:assert/strict";
import { test } from "node:test";

import {
  developerWaitReasons,
  excerptPrompt,
  formatDeveloperWaitMessage,
  isSlackIncomingWebhook,
  shouldNotifyAutoMergeWait,
  slackNotificationDecision,
  slackNotificationSummary,
} from "../dist/index.js";

const WEBHOOK = "https://hooks.slack.com/services/T1/B2/abc";

test("accepts Slack incoming webhook URLs only", () => {
  assert.equal(isSlackIncomingWebhook(WEBHOOK), true);
  assert.equal(
    isSlackIncomingWebhook("https://hooks.slack-gov.com/services/T1/B2/abc"),
    true,
  );
  assert.equal(isSlackIncomingWebhook("http://hooks.slack.com/services/T1/B2/abc"), false);
  assert.equal(isSlackIncomingWebhook("https://example.com/services/T1/B2/abc"), false);
  assert.equal(isSlackIncomingWebhook("https://hooks.slack.com/services/T1/B2/abc?x=1"), false);
  assert.equal(isSlackIncomingWebhook("https://user:pass@hooks.slack.com/services/T1/B2/abc"), false);
  assert.equal(isSlackIncomingWebhook("https://hooks.slack.com/triggers/T1/123"), false);
});

test("notifies once when auto-merge starts waiting on a developer", () => {
  const base = {
    previousStatus: "running",
    nextStatus: "awaiting_approval",
    delivery: "auto_merge",
    shadow: false,
    webhookConfigured: true,
  };
  assert.equal(shouldNotifyAutoMergeWait(base), true);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, nextStatus: "awaiting_review" }), true);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, previousStatus: "awaiting_approval" }), false);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, delivery: "pr_only" }), false);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, shadow: true }), false);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, webhookConfigured: false }), false);
  assert.equal(shouldNotifyAutoMergeWait({ ...base, nextStatus: "finished" }), false);
});

test("plan approval message names the blocking rule and skips the rest of the prompt", () => {
  const prompt = `${"Add a refund button. ".repeat(20)}secret tail`;
  const text = formatDeveloperWaitMessage({
    projectName: "acme-web",
    status: "awaiting_approval",
    prompt,
    requester: "maya",
    requesterVerified: true,
    reasons: developerWaitReasons({
      status: "awaiting_approval",
      planMatched: [
        { name: "Fast Lane: allow everything", kind: "allow", outcome: "execute", shadow: false },
        { name: "Deletes data (agent flag)", kind: "escalate", outcome: "review_before_execution", shadow: false },
        { name: "Shadow only", kind: "escalate", outcome: "review_before_merge", shadow: true },
      ],
      diffMatched: [],
      handoffReason: null,
      planApproved: false,
    }),
    risk: "high",
    flags: ["payments"],
    requestUrl: "https://admin.example/requests/req-1",
    prUrl: null,
    previewUrl: null,
  });

  assert.match(text, /needs plan approval/);
  assert.match(text, /maya \(verified\)/);
  assert.match(text, /Deletes data \(agent flag\) → Review before execution/);
  assert.doesNotMatch(text, /Shadow only/);
  assert.doesNotMatch(text, /secret tail/);
  assert.match(text, /Risk: high · Payments \/ billing/);
  assert.match(text, /<https:\/\/admin\.example\/requests\/req-1\|Open in Snag>/);
  assert.equal(excerptPrompt(prompt).length <= 200, true);
});

test("PR review message includes the handoff and the pull request", () => {
  const text = formatDeveloperWaitMessage({
    projectName: "acme-web",
    status: "awaiting_review",
    prompt: "Add a refund button",
    requester: "maya",
    requesterVerified: false,
    reasons: developerWaitReasons({
      status: "awaiting_review",
      planMatched: [],
      diffMatched: [
        {
          name: "PR changes files that were not in the plan",
          kind: "builtin",
          outcome: "review_before_merge",
          shadow: false,
        },
      ],
      handoffReason: "CI failed on the pull request.",
      planApproved: false,
    }),
    risk: null,
    flags: [],
    requestUrl: "https://admin.example/requests/req-1",
    prUrl: "https://github.com/acme/web/pull/12",
    previewUrl: "https://preview.example/pr-12",
  });

  assert.match(text, /needs PR review/);
  assert.match(text, /maya \(unverified\)/);
  assert.match(text, /PR changes files that were not in the plan → Review before merge/);
  assert.match(text, /CI failed on the pull request\./);
  assert.match(text, /<https:\/\/github\.com\/acme\/web\/pull\/12\|Pull request>/);
  assert.match(text, /<https:\/\/preview\.example\/pr-12\|Preview>/);
});

test("records a skip when a developer wait is not an auto-merge send", () => {
  assert.deepEqual(
    slackNotificationDecision({
      previousStatus: "running",
      nextStatus: "awaiting_approval",
      delivery: "pr_only",
      shadow: false,
      webhookConfigured: true,
    }),
    { action: "skip", reason: "not_auto_merge" },
  );
  assert.deepEqual(
    slackNotificationDecision({
      previousStatus: "running",
      nextStatus: "awaiting_review",
      delivery: "auto_merge",
      shadow: true,
      webhookConfigured: true,
    }),
    { action: "skip", reason: "shadow" },
  );
  assert.deepEqual(
    slackNotificationDecision({
      previousStatus: "running",
      nextStatus: "awaiting_review",
      delivery: "auto_merge",
      shadow: false,
      webhookConfigured: false,
    }),
    { action: "skip", reason: "no_webhook" },
  );
  assert.deepEqual(
    slackNotificationDecision({
      previousStatus: "awaiting_review",
      nextStatus: "awaiting_review",
      delivery: "auto_merge",
      shadow: false,
      webhookConfigured: true,
    }),
    { action: "ignore" },
  );
  assert.equal(
    slackNotificationSummary({
      at: "2026-10-24T16:00:00Z",
      wait: "awaiting_review",
      outcome: "failed",
      reason: "slack_rejected",
      http_status: 404,
    }),
    "Triggered for PR review. Slack rejected the message (HTTP 404).",
  );
});

test("a missing allow rule is the reason when nothing else matched", () => {
  assert.deepEqual(
    developerWaitReasons({
      status: "awaiting_approval",
      planMatched: [],
      diffMatched: [],
      handoffReason: null,
      planApproved: false,
    }),
    ["No allow rule matched."],
  );
});
