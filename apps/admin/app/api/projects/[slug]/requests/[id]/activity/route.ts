import type { SnagRequestActivity } from "@snag/shared";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route";
import { createServiceClient } from "@/lib/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const access = await requireProjectAccess(slug, "read");
  if (access.response) return access.response;

  const service = createServiceClient();
  const { data: row } = await service
    .from("snag_requests")
    .select("id")
    .eq("id", id)
    .eq("project_id", access.project.id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const [transitions, audit] = await Promise.all([
    service
      .from("snag_request_transitions")
      .select("id, from_status, to_status, phase, at")
      .eq("request_id", id)
      .order("at", { ascending: true })
      .order("id", { ascending: true }),
    service
      .from("snag_audit_log")
      .select("id, action, actor_id, metadata, created_at")
      .eq("target_type", "snag_requests")
      .eq("target_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (transitions.error || audit.error) {
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }

  const actorIds = [
    ...new Set((audit.data ?? []).map((entry) => entry.actor_id).filter(Boolean)),
  ] as string[];
  const emails = new Map<string, string | null>();
  await Promise.all(
    actorIds.map(async (actorId) => {
      const { data } = await service.auth.admin.getUserById(actorId);
      emails.set(actorId, data.user?.email ?? null);
    }),
  );

  const body: SnagRequestActivity = {
    transitions: transitions.data ?? [],
    audit: (audit.data ?? []).map(({ actor_id, ...entry }) => ({
      ...entry,
      actor_email: actor_id ? (emails.get(actor_id) ?? null) : null,
    })),
  };
  return NextResponse.json(body);
}
