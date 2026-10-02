import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivationFacts } from "@/lib/activation-checklist";

export async function loadActivationFacts(
  service: SupabaseClient,
  project: { id: string; organization_id: string | null },
): Promise<ActivationFacts> {
  const firstRequest = service
    .from("snag_requests")
    .select("created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstVerified = service
    .from("snag_requests")
    .select("created_at")
    .eq("project_id", project.id)
    .eq("requester_verified", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const owner = project.organization_id
    ? service
        .from("snag_org_members")
        .select("created_at")
        .eq("organization_id", project.organization_id)
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const rules = project.organization_id
    ? service
        .from("snag_policy_rules")
        .select("created_at, project_id")
        .eq("organization_id", project.organization_id)
        .eq("kind", "allow")
        .eq("enabled", true)
        .eq("shadow", false)
        .order("created_at", { ascending: true })
    : Promise.resolve({ data: [] as { created_at: string; project_id: string | null }[] });

  const [requestResult, verifiedResult, ownerResult, rulesResult] = await Promise.all([
    firstRequest,
    firstVerified,
    owner,
    rules,
  ]);

  const firstAllow = (rulesResult.data ?? []).find(
    (rule) => rule.project_id == null || rule.project_id === project.id,
  );

  return {
    ownerInvitedAt: ownerResult.data?.created_at ?? null,
    firstRequestAt: requestResult.data?.created_at ?? null,
    firstVerifiedRequestAt: verifiedResult.data?.created_at ?? null,
    firstAllowRuleAt: firstAllow?.created_at ?? null,
  };
}
