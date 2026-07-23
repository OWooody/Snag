import { createServiceClient } from "@/lib/service";

export async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const service = createServiceClient();
  await service.from("snag_audit_log").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    metadata: params.metadata ?? {},
  });
}
