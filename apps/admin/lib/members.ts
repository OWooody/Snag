import type { OrgMemberRole, SnagOrgMemberListItem } from "@snag/shared";
import { createServiceClient } from "@/lib/service";

export async function loadOrgMembers(organizationId: string): Promise<SnagOrgMemberListItem[]> {
  const service = createServiceClient();
  const { data } = await service.rpc("snag_org_members_with_email", { p_org_id: organizationId });
  return ((data ?? []) as Array<{
    id: string;
    user_id: string | null;
    email: string | null;
    role: OrgMemberRole;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email ?? "",
    role: row.role,
    active: row.user_id !== null,
    created_at: row.created_at,
  }));
}

export async function countOrgOwners(organizationId: string): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from("snag_org_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner");
  return count ?? 0;
}
