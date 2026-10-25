/**
 * Posts one Slack message when auto-merge leaves a request waiting for a
 * developer. A missing webhook, shadow mode, or a failed post never changes
 * the request.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  developerWaitReasons,
  formatDeveloperWaitMessage,
  isSlackIncomingWebhook,
  slackNotificationDecision,
  type SlackNotificationAttempt,
  type SlackRuleMatch,
} from "../../../packages/shared/src/slack.ts";
import { decryptSecret, getEncryptionSecret } from "./crypto.ts";
import type { PolicyStageDecision } from "./policy.ts";
import { projectSettings, type ProjectRow } from "./projects.ts";

export interface DeveloperWaitRow {
  id: string;
  status: string;
  prompt: string;
  requester: string | null;
  requester_verified: boolean;
  handoff_reason: string | null;
  pr_url: string | null;
  preview_url: string | null;
  plan: { risk: "low" | "medium" | "high"; flags: string[] } | null;
  policy_decision: {
    plan?: PolicyStageDecision;
    diff?: PolicyStageDecision;
  } | null;
  approved_at: string | null;
  slack_notifications?: SlackNotificationAttempt[] | null;
}

async function recordAttempt(
  service: SupabaseClient,
  row: DeveloperWaitRow,
  attempt: SlackNotificationAttempt,
): Promise<void> {
  const next = [...(row.slack_notifications ?? []), attempt];
  const { error } = await service
    .from("snag_requests")
    .update({ slack_notifications: next })
    .eq("id", row.id);
  if (error) {
    console.error(`snag slack record failed request=${row.id}`);
    return;
  }
  row.slack_notifications = next;
}

function matches(stage: PolicyStageDecision | undefined): SlackRuleMatch[] {
  return stage?.matched ?? [];
}

function requestAdminUrl(requestId: string): string | null {
  const base = Deno.env.get("SNAG_ADMIN_URL") ?? Deno.env.get("NEXT_PUBLIC_ADMIN_URL");
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/requests/${requestId}`;
}

export async function notifyAutoMergeDeveloperWait(
  service: SupabaseClient,
  project: ProjectRow,
  row: DeveloperWaitRow,
  previousStatus: string,
): Promise<void> {
  const settings = projectSettings(project);
  const encrypted = project.snag_organizations?.slack_webhook_encrypted ?? null;
  const decision = slackNotificationDecision({
    previousStatus,
    nextStatus: row.status,
    delivery: settings.delivery,
    shadow: settings.shadow,
    webhookConfigured: Boolean(encrypted),
  });
  if (decision.action === "ignore") return;
  if (row.status !== "awaiting_approval" && row.status !== "awaiting_review") return;

  const at = new Date().toISOString();
  if (decision.action === "skip") {
    await recordAttempt(service, row, {
      at,
      wait: row.status,
      outcome: "skipped",
      reason: decision.reason,
    });
    return;
  }
  if (!encrypted) return;

  let url: string;
  try {
    url = await decryptSecret(encrypted, getEncryptionSecret());
  } catch {
    console.error(`snag slack notify failed request=${row.id}`);
    await recordAttempt(service, row, {
      at,
      wait: row.status,
      outcome: "failed",
      reason: "decrypt_failed",
    });
    return;
  }
  if (!isSlackIncomingWebhook(url)) {
    console.error(`snag slack webhook rejected request=${row.id}`);
    await recordAttempt(service, row, {
      at,
      wait: row.status,
      outcome: "failed",
      reason: "invalid_webhook",
    });
    return;
  }

  const policy = row.policy_decision;
  const text = formatDeveloperWaitMessage({
    projectName: project.name,
    status: row.status,
    prompt: row.prompt,
    requester: row.requester,
    requesterVerified: row.requester_verified,
    reasons: developerWaitReasons({
      status: row.status,
      planMatched: matches(policy?.plan),
      diffMatched: matches(policy?.diff),
      handoffReason: row.handoff_reason,
      planApproved: Boolean(row.approved_at),
    }),
    risk: row.plan?.risk ?? null,
    flags: row.plan?.flags ?? [],
    requestUrl: requestAdminUrl(row.id),
    prUrl: row.pr_url,
    previewUrl: row.preview_url,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error(`snag slack notify failed request=${row.id} status=${response.status}`);
      await recordAttempt(service, row, {
        at,
        wait: row.status,
        outcome: "failed",
        reason: "slack_rejected",
        http_status: response.status,
      });
      return;
    }
    await recordAttempt(service, row, { at, wait: row.status, outcome: "sent" });
  } catch {
    console.error(`snag slack notify failed request=${row.id}`);
    await recordAttempt(service, row, {
      at,
      wait: row.status,
      outcome: "failed",
      reason: "unreachable",
    });
  }
}
