import {
  buildImplementationPrompt,
  decryptSecret,
  requestReviewDecisionSchema,
  type PolicyDecisionRecord,
} from "@snag/shared";
import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { sendCursorFollowUp } from "@/lib/cursor";
import { encryptionSecretOrError, requireProjectAccess } from "@/lib/project-route";
import { REQUEST_COLUMNS } from "@/lib/requests";
import { createServiceClient } from "@/lib/service";

interface PendingRow {
  id: string;
  status: string;
  agent_id: string | null;
  lifecycle_version: number;
  policy_decision: PolicyDecisionRecord | null;
}

/** Developer approval or rejection of a plan waiting in awaiting_approval. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "admin");
  if (access.response) return access.response;
  const { user, project } = access;

  const body = await request.json().catch(() => null);
  const parsed = requestReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { decision, note } = parsed.data;

  const service = createServiceClient();
  const { data: row } = await service
    .from("snag_requests")
    .select("id, status, agent_id, lifecycle_version, policy_decision")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle<PendingRow>();
  if (!row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (row.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: "This request is no longer waiting for approval." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const policyDecision: PolicyDecisionRecord = {
    ...(row.policy_decision ?? {}),
    note:
      decision === "approve"
        ? "Plan approved by a developer"
        : "Plan rejected by a developer",
  };

  async function transition(update: Record<string, unknown>, fromVersion: number) {
    const { data } = await service
      .from("snag_requests")
      .update({ ...update, lifecycle_version: fromVersion + 1, updated_at: now })
      .eq("id", row!.id)
      .eq("lifecycle_version", fromVersion)
      .select(REQUEST_COLUMNS);
    return data?.[0] ?? null;
  }

  if (decision === "reject") {
    const updated = await transition(
      {
        status: "error",
        error: "Plan rejected by a developer",
        policy_decision: policyDecision,
      },
      row.lifecycle_version,
    );
    if (!updated) {
      return NextResponse.json({ error: "Request changed; reload and retry." }, { status: 409 });
    }
    await writeAuditLog({
      actorId: user.id,
      action: "request.plan_reject",
      targetType: "snag_requests",
      targetId: row.id,
      metadata: { slug, has_note: Boolean(note) },
    });
    return NextResponse.json(updated);
  }

  if (!row.agent_id) {
    return NextResponse.json({ error: "Request has no agent to resume" }, { status: 409 });
  }
  const encryption = encryptionSecretOrError();
  if (encryption.response) return encryption.response;

  let cursorKey: string;
  try {
    cursorKey = await decryptSecret(project.cursor_api_key_encrypted, encryption.secret);
  } catch {
    return NextResponse.json({ error: "Cursor API key could not be decrypted" }, { status: 500 });
  }

  const updated = await transition(
    {
      status: "running",
      phase: "implementing",
      phase_started_at: now,
      approved_by: user.id,
      approved_at: now,
      error: null,
      policy_decision: policyDecision,
    },
    row.lifecycle_version,
  );
  if (!updated) {
    return NextResponse.json({ error: "Request changed; reload and retry." }, { status: 409 });
  }

  try {
    await sendCursorFollowUp(
      cursorKey,
      row.agent_id,
      buildImplementationPrompt({
        baseRef: project.repo_ref,
        approvedBy: "developer",
        developerNote: note,
      }),
    );
  } catch (error) {
    console.error(`snag approval follow-up failed request=${row.id}:`, error);
    await transition(
      {
        status: "awaiting_approval",
        phase: "planning",
        approved_by: null,
        approved_at: null,
        error: "Could not reach the agent. Try approving again.",
      },
      row.lifecycle_version + 1,
    );
    return NextResponse.json(
      { error: "Could not reach the Cursor agent. The request is still awaiting approval." },
      { status: 502 },
    );
  }

  await writeAuditLog({
    actorId: user.id,
    action: "request.plan_approve",
    targetType: "snag_requests",
    targetId: row.id,
    metadata: { slug, has_note: Boolean(note) },
  });

  return NextResponse.json(updated);
}
