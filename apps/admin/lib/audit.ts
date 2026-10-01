import { getEffectiveImpersonationOrgId } from "@/lib/impersonation";
import { createServiceClient } from "@/lib/service";

export async function writeAuditLog(params: {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const impersonatingOrgId = await getEffectiveImpersonationOrgId(params.actorId);
  const metadata = {
    ...(params.metadata ?? {}),
    ...(impersonatingOrgId ? { impersonating_org_id: impersonatingOrgId } : {}),
  };
  const service = createServiceClient();
  await service.from("snag_audit_log").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    metadata,
  });
}
