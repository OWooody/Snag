import {
  resolveEffectiveExecuteDelivery,
  type ExecuteDelivery,
  type SnagProjectSafe,
} from "@snag/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivationFacts = {
  ownerInvitedAt: string | null;
  firstRequestAt: string | null;
  firstVerifiedRequestAt: string | null;
  firstAllowRuleAt: string | null;
};

export type ActivationStep = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  /** When this step was completed. Null when Snag has no timestamp for it. */
  at: string | null;
  /** Word shown beside the timestamp, such as "Saved" or "First request". */
  atLabel: string | null;
};

export type ActivationSection = {
  id: string;
  title: string;
  steps: ActivationStep[];
};

export type ActivationChecklistModel = {
  sections: ActivationSection[];
  doneCount: number;
  totalCount: number;
  complete: boolean;
};

function step(
  partial: Omit<ActivationStep, "at" | "atLabel"> & { at?: string | null; atLabel?: string | null },
): ActivationStep {
  return {
    at: partial.done ? (partial.at ?? null) : null,
    atLabel: partial.done && partial.at ? (partial.atLabel ?? null) : null,
    id: partial.id,
    title: partial.title,
    detail: partial.detail,
    done: partial.done,
  };
}

function isLocalDevOrigin(entry: string): boolean {
  try {
    const url = new URL(entry);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function buildActivationChecklist(
  project: SnagProjectSafe,
  orgDelivery: ExecuteDelivery,
  facts: ActivationFacts,
): ActivationChecklistModel {
  const origins = project.allowed_origins ?? [];
  const originsSet = origins.length > 0;
  const onlyLocalOrigins = originsSet && origins.every(isLocalDevOrigin);
  const delivery = resolveEffectiveExecuteDelivery(project.execute_delivery, orgDelivery);
  const deliveryReady = delivery === "preview_confirm" || delivery === "auto_merge";

  const sections: ActivationSection[] = [
    {
      id: "host",
      title: "Host app",
      steps: [
        step({
          id: "install",
          title: "Install Snag in the host app",
          detail:
            "Install the SDK, set the relay endpoint and project key, and mount the overlay. Marked when the first request arrives.",
          done: Boolean(facts.firstRequestAt),
          at: facts.firstRequestAt,
          atLabel: "First request",
        }),
        step({
          id: "origins",
          title: "Allow the host client",
          detail: onlyLocalOrigins
            ? "Only local dev origins are listed. Add the staging origin, or app:// bundle id, before the host app leaves localhost."
            : "Add at least one web origin or app:// bundle id. An empty list blocks every client.",
          done: originsSet,
        }),
      ],
    },
    {
      id: "agent",
      title: "Agent",
      steps: [
        step({
          id: "cursor-key",
          title: "Save a Cursor API key",
          detail: "The key launches the coding agent against this repository.",
          done: Boolean(project.cursor_key_updated_at),
          at: project.cursor_key_updated_at,
          atLabel: "Saved",
        }),
        step({
          id: "repo",
          title: "Set the repository and branch",
          detail: "The branch must exist on GitHub and already have commits.",
          done: Boolean(project.repo_url.trim() && project.repo_ref.trim()),
        }),
        step({
          id: "prompt",
          title: "Add prompt instructions",
          detail: "Tell the agent where the app lives and which conventions to follow.",
          done: project.prompt_instructions.trim().length > 0,
        }),
        step({
          id: "enabled",
          title: "Enable the tenant",
          detail: "While this is off, the SDK probe returns enabled: false and the tab stays hidden.",
          done: project.enabled,
        }),
      ],
    },
    {
      id: "company",
      title: "Company",
      steps: [
        step({
          id: "owner",
          title: "Invite a company owner",
          detail: "They can open Integration and Requests for this tenant.",
          done: Boolean(facts.ownerInvitedAt),
          at: facts.ownerInvitedAt,
          atLabel: "Invited",
        }),
      ],
    },
    {
      id: "delivery",
      title: "Delivery",
      steps: [
        step({
          id: "github-token",
          title: "Save a GitHub token",
          detail:
            "Needed to read checks, find preview URLs, and merge. Without it, merge deliveries fall back to PR only.",
          done: Boolean(project.github_token_updated_at),
          at: project.github_token_updated_at,
          atLabel: "Saved",
        }),
        step({
          id: "delivery",
          title: "Choose a merge delivery",
          detail: deliveryReady
            ? delivery === "auto_merge"
              ? "Delivery is merge directly to production."
              : "Delivery is preview, then merge."
            : "Switch off PR only. Otherwise the GitHub token is unused and the agent only opens a pull request.",
          done: deliveryReady,
        }),
      ],
    },
    {
      id: "auto-merge",
      title: "Auto-merge",
      steps: [
        step({
          id: "signing-secret",
          title: "Generate a requester signing secret",
          detail: "Give it to the host app's backend. It is shown once.",
          done: Boolean(project.requester_secret_updated_at),
          at: project.requester_secret_updated_at,
          atLabel: "Generated",
        }),
        step({
          id: "signed-requests",
          title: "Host app signs requester tokens",
          detail:
            "The app sends the signed token with each request. Unsigned requests still file, but they stay unverified.",
          done: Boolean(facts.firstVerifiedRequestAt),
          at: facts.firstVerifiedRequestAt,
          atLabel: "First verified request",
        }),
        step({
          id: "trusted",
          title: "Add trusted requesters",
          detail: "Ids must match the token's sub. Auto-merge only applies to this list.",
          done: (project.trusted_requesters ?? []).length > 0,
        }),
        step({
          id: "acknowledge",
          title: "Acknowledge auto-merge",
          detail: "Confirms that matching requests can ship without a code review.",
          done: Boolean(project.auto_merge_acknowledged_at),
          at: project.auto_merge_acknowledged_at,
          atLabel: "Acknowledged",
        }),
        step({
          id: "allow-rule",
          title: "Add an allow rule",
          detail: "With no allow rule, requests stop at review before execution.",
          done: Boolean(facts.firstAllowRuleAt),
          at: facts.firstAllowRuleAt,
          atLabel: "Added",
        }),
      ],
    },
  ];

  const steps = sections.flatMap((section) => section.steps);
  const doneCount = steps.filter((item) => item.done).length;

  return {
    sections,
    doneCount,
    totalCount: steps.length,
    complete: doneCount === steps.length,
  };
}

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
