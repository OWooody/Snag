import {
  forgeHostFromRepoUrl,
  resolveEffectiveExecuteDelivery,
  type AuthProvider,
  type ExecuteDelivery,
  type ForgeHost,
  type HostRuntime,
  type SnagProjectSafe,
} from "@snag/shared";

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
  footnote: string;
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

function installDetail(host: HostRuntime | null): string {
  const marked = "Marked when the first request arrives.";
  if (host === "vercel") {
    return `Install @snag-tech/react, set NEXT_PUBLIC_SNAG_ENDPOINT and NEXT_PUBLIC_SNAG_PROJECT_KEY on the Vercel project, and mount SnagOverlay in the root layout. ${marked}`;
  }
  return `Install the SDK, set the relay endpoint and project key, and mount the overlay. ${marked}`;
}

function originsDetail(host: HostRuntime | null, onlyLocalOrigins: boolean): string {
  if (host === "vercel") {
    return onlyLocalOrigins
      ? "Only local dev origins are listed. Add the stable Vercel staging URL. Each preview deploy has its own host, so leave those off this list."
      : "Add the stable Vercel staging URL. Each preview deploy has its own host, so the staging domain is the one to allow.";
  }
  return onlyLocalOrigins
    ? "Only local dev origins are listed. Add the staging origin, or app:// bundle id, before the host app leaves localhost."
    : "Add at least one web origin or app:// bundle id. An empty list blocks every client.";
}

function deliveryDetail(
  host: HostRuntime | null,
  repoHost: ForgeHost | null,
  deliveryReady: boolean,
  autoMerge: boolean,
): string {
  if (deliveryReady) {
    return autoMerge
      ? "Delivery is merge directly to production."
      : "Delivery is preview, then merge.";
  }
  if (repoHost === "origin") {
    return "Origin can open a pull request or merge it once CI is green. Preview, then merge stays on GitHub.";
  }
  if (host === "vercel") {
    return "Vercel posts a preview URL on the pull request. Switch to Preview, then merge to use it. PR only leaves that URL unused.";
  }
  return "Switch off PR only. Otherwise the GitHub token is unused and the agent only opens a pull request.";
}

function signingSecretDetail(host: HostRuntime | null, auth: AuthProvider | null): string {
  if (host === "vercel" && auth === "supabase") {
    return "Generate it here, then set SNAG_REQUESTER_SECRET on the Vercel project. A Supabase route signs the Auth user id with it. It is shown once.";
  }
  if (host === "vercel") {
    return "Generate it here, then set SNAG_REQUESTER_SECRET on the Vercel project. It is shown once.";
  }
  if (auth === "supabase") {
    return "Give it to the host backend as SNAG_REQUESTER_SECRET. A Supabase route signs the Auth user id with it. It is shown once.";
  }
  return "Give it to the host app's backend. It is shown once.";
}

function signedRequestsDetail(host: HostRuntime | null, auth: AuthProvider | null): string {
  if (auth === "supabase") {
    const secret = host === "vercel" ? " with SNAG_REQUESTER_SECRET" : "";
    return `Add a route that signs the logged-in Supabase user's id${secret}, and send that token with each request. Unsigned requests still file, but they stay unverified.`;
  }
  return "The app sends the signed token with each request. Unsigned requests still file, but they stay unverified.";
}

function checklistFootnote(host: HostRuntime | null, repoHost: ForgeHost | null): string {
  if (repoHost === "origin") {
    return "Snag does not record connecting the Cursor account to this Origin repository, CI on the production branch, or rulesets that let the Origin app merge. Those stay outside this list.";
  }
  if (host === "vercel") {
    return "Snag does not record connecting the Cursor account to GitHub, CI on the production branch, or branch protection that lets the token user merge. Vercel posts the preview URL on the pull request, so that is not a separate step.";
  }
  return "Snag does not record connecting the Cursor account to GitHub, preview deployments on pull requests, CI on the production branch, or branch protection that lets the token user merge. Those stay outside this list.";
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
  const repoHost = forgeHostFromRepoUrl(project.repo_url);
  const deliveryReady = repoHost === "origin"
    ? delivery === "auto_merge"
    : delivery === "preview_confirm" || delivery === "auto_merge";
  const host = project.host_runtime;
  const auth = project.auth_provider;

  const sections: ActivationSection[] = [
    {
      id: "host",
      title: "Host app",
      steps: [
        step({
          id: "install",
          title: "Install Snag in the host app",
          detail: installDetail(host),
          done: Boolean(facts.firstRequestAt),
          at: facts.firstRequestAt,
          atLabel: "First request",
        }),
        step({
          id: "origins",
          title: "Allow the host client",
          detail: originsDetail(host, onlyLocalOrigins),
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
          detail: repoHost === "origin"
            ? "The branch must exist on Origin and already have commits."
            : "The branch must exist on GitHub and already have commits.",
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
          title: repoHost === "origin" ? "Save an Origin app" : "Save a GitHub token",
          detail: repoHost === "origin"
            ? "Needed to read checks and merge. Without it, merge deliveries fall back to PR only. Preview, then merge is not available on Origin."
            : "Needed to read checks, find preview URLs, and merge. Without it, merge deliveries fall back to PR only.",
          done: repoHost === "origin"
            ? Boolean(project.origin_credentials_updated_at)
            : Boolean(project.github_token_updated_at),
          at: repoHost === "origin"
            ? project.origin_credentials_updated_at
            : project.github_token_updated_at,
          atLabel: "Saved",
        }),
        step({
          id: "delivery",
          title: "Choose a merge delivery",
          detail: deliveryDetail(host, repoHost, deliveryReady, delivery === "auto_merge"),
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
          detail: signingSecretDetail(host, auth),
          done: Boolean(project.requester_secret_updated_at),
          at: project.requester_secret_updated_at,
          atLabel: "Generated",
        }),
        step({
          id: "signed-requests",
          title: "Host app signs requester tokens",
          detail: signedRequestsDetail(host, auth),
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
    footnote: checklistFootnote(host, repoHost),
  };
}
