import { z } from "zod";
import { AGENT_MODES } from "./agent-mode";
import {
  EXECUTE_DELIVERIES,
  PLAN_FLAGS,
  PLAN_RISKS,
  POLICY_OUTCOMES,
} from "./execute-policy";
import { forgeHostFromRepoUrl } from "./forge";
import { DEFAULT_DEV_ORIGINS, normalizeAllowedEntry } from "./origins";

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens");

export const repoUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((url) => forgeHostFromRepoUrl(url) !== null, {
    message:
      "Repository URL must be a GitHub (https://github.com/owner/repo) or Cursor Origin (https://origin.cursor.com/owner/repo) HTTPS URL",
  });

export const originCredentialsUpdateSchema = z.object({
  origin_app_id: z.string().trim().min(1).max(128),
  origin_installation_id: z.string().trim().min(1).max(128),
  origin_app_private_key: z
    .string()
    .trim()
    .min(1)
    .max(8000)
    .refine(
      (value) => value.includes("BEGIN PRIVATE KEY") && value.includes("END PRIVATE KEY"),
      {
        message:
          "Private key must be a PKCS#8 PEM (BEGIN PRIVATE KEY), from openssl genpkey -algorithm ED25519",
      },
    ),
});

export const promptInstructionsSchema = z.string().max(4000).default("");

export const rateLimitSchema = z.number().int().positive().max(1000);

export const agentModeSchema = z.enum(AGENT_MODES);

export const projectAgentModeOverrideSchema = agentModeSchema.nullable();

export const allowedOriginSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => normalizeAllowedEntry(value) !== null, {
    message:
      "Must be a valid origin (e.g. https://staging.example.com) or app id (e.g. app://com.example.app)",
  })
  .transform((value) => normalizeAllowedEntry(value)!);

export const allowedOriginsSchema = z
  .array(allowedOriginSchema)
  .max(20)
  .default([]);

export const companyProjectUpdateSchema = z.object({
  repo_url: repoUrlSchema,
  repo_ref: z.string().trim().min(1).max(256),
  model: z.string().trim().max(128).nullable().optional(),
  prompt_instructions: promptInstructionsSchema,
  enabled: z.boolean(),
  agent_mode: projectAgentModeOverrideSchema.optional(),
  requester_followups_enabled: z.boolean().nullable().optional(),
  requester_plan_review_enabled: z.boolean().nullable().optional(),
  allowed_origins: allowedOriginsSchema.optional(),
});

export const executeDeliverySchema = z.enum(EXECUTE_DELIVERIES);

export const policyOutcomeSchema = z.enum(POLICY_OUTCOMES);

export const companyOrganizationUpdateSchema = z.object({
  organization_id: z.string().uuid(),
  agent_mode: agentModeSchema,
  requester_followups_enabled: z.boolean(),
  requester_plan_review_enabled: z.boolean().optional(),
  execute_delivery: executeDeliverySchema.optional(),
  default_outcome: policyOutcomeSchema.optional(),
  policy_shadow_mode: z.boolean().optional(),
  /** Required when switching the org default to auto_merge. */
  acknowledge_auto_merge: z.boolean().optional(),
});

export const orgMemberRoleSchema = z.enum(["owner", "admin", "viewer"]);

export const orgMemberInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  role: orgMemberRoleSchema,
});

export const orgMemberUpdateSchema = z.object({
  role: orgMemberRoleSchema,
});

export const requesterIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\x20-\x7E]+$/, "Requester ids must be printable ASCII");

export const projectExecutionUpdateSchema = z.object({
  /** Omitted leaves the project's agent mode unchanged. Null inherits the organization. */
  agent_mode: projectAgentModeOverrideSchema.optional(),
  execute_delivery: executeDeliverySchema.nullable(),
  default_outcome: policyOutcomeSchema.nullable(),
  policy_shadow_mode: z.boolean().nullable(),
  trusted_requesters: z.array(requesterIdSchema).max(200),
  auto_merge_daily_limit: z.number().int().positive().max(500),
  /** Required the first time a project's effective delivery becomes auto_merge. */
  acknowledge_auto_merge: z.boolean().optional(),
});

export const githubTokenUpdateSchema = z.object({
  github_token: z.string().trim().min(1).max(512),
});

const globListSchema = z.array(z.string().trim().min(1).max(256)).min(1).max(50);

export const policyConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("path_glob_any"), globs: globListSchema }),
  z.object({ type: z.literal("path_glob_all"), globs: globListSchema }),
  z.object({ type: z.literal("max_files"), max: z.number().int().min(0).max(10_000) }),
  z.object({ type: z.literal("max_lines"), max: z.number().int().min(0).max(1_000_000) }),
  z.object({ type: z.literal("risk_at_least"), level: z.enum(PLAN_RISKS) }),
  z.object({ type: z.literal("flag"), flag: z.enum(PLAN_FLAGS) }),
  z.object({
    type: z.literal("risky_sql"),
    globs: globListSchema,
    max_added_columns: z.number().int().min(0).max(1_000),
  }),
  z.object({ type: z.literal("files_removed") }),
  z.object({ type: z.literal("requester_unverified") }),
  z.object({ type: z.literal("requester_not_trusted") }),
]);

export const policyRuleConditionSchema = z.object({
  all: z.array(policyConditionSchema).min(1).max(10),
});

const policyRuleBaseSchema = z.object({
  name: z.string().trim().min(1).max(128),
  enabled: z.boolean().default(true),
  shadow: z.boolean().default(false),
  condition: policyRuleConditionSchema,
});

export const policyRuleInputSchema = z.discriminatedUnion("kind", [
  policyRuleBaseSchema.extend({
    kind: z.literal("allow"),
    outcome: z.literal("execute"),
  }),
  policyRuleBaseSchema.extend({
    kind: z.literal("escalate"),
    outcome: z.enum(["review_before_merge", "review_before_execution"]),
  }),
]);

export const policyRuleCreateSchema = z.intersection(
  policyRuleInputSchema,
  z.object({ scope: z.enum(["project", "organization"]).default("project") }),
);

/** Saves a reviewed template: every rule is created, or none are. */
export const policyRuleBulkCreateSchema = z.object({
  scope: z.enum(["project", "organization"]).default("project"),
  template_id: z.string().trim().min(1).max(64).optional(),
  rules: z.array(policyRuleInputSchema).min(1).max(20),
});

export const policyRuleToggleSchema = z.object({
  enabled: z.boolean().optional(),
  shadow: z.boolean().optional(),
});

export const requestReviewDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "revise"]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.decision !== "revise" || Boolean(value.note), {
    message: "Tell the agent what to change in the plan",
    path: ["note"],
  });

export const cursorKeyUpdateSchema = z.object({
  cursor_api_key: z.string().trim().min(1).max(512),
});

export const createTenantSchema = z
  .object({
    /** Set to add a project to an existing organization. Org fields are then ignored. */
    organization_id: z.string().uuid().or(z.literal("")).optional(),
    org_name: z.string().trim().max(128).optional(),
    org_slug: z.string().trim().max(64).optional(),
    project_name: z.string().trim().min(1).max(128),
    project_slug: slugSchema,
    repo_url: repoUrlSchema,
    repo_ref: z.string().trim().min(1).max(256).default("main"),
    model: z.string().trim().max(128).nullable().optional(),
    prompt_instructions: promptInstructionsSchema,
    cursor_api_key: z.string().trim().min(1).max(512),
    owner_email: z.string().trim().optional(),
    per_ip_hourly_limit: rateLimitSchema.default(10),
    hourly_limit: rateLimitSchema.default(10),
    daily_limit: rateLimitSchema.default(30),
    agent_mode: agentModeSchema.default("plan_only"),
    requester_followups_enabled: z.boolean().default(true),
    allowed_origins: allowedOriginsSchema.default([...DEFAULT_DEV_ORIGINS]),
  })
  .superRefine((value, ctx) => {
    if (value.organization_id) return;

    if (!value.org_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["org_name"],
        message: "Required",
      });
    }

    const slug = slugSchema.safeParse(value.org_slug ?? "");
    if (!slug.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["org_slug"],
        message: slug.error.issues[0]?.message ?? "Invalid slug",
      });
    }

    const email = z.string().trim().email().safeParse(value.owner_email ?? "");
    if (!email.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["owner_email"],
        message: "Enter a valid email",
      });
    }
  });

export const platformTenantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  repo_url: repoUrlSchema.optional(),
  repo_ref: z.string().trim().min(1).max(256).optional(),
  model: z.string().trim().max(128).nullable().optional(),
  prompt_instructions: promptInstructionsSchema.optional(),
  enabled: z.boolean().optional(),
  per_ip_hourly_limit: rateLimitSchema.optional(),
  hourly_limit: rateLimitSchema.optional(),
  daily_limit: rateLimitSchema.optional(),
  agent_mode: projectAgentModeOverrideSchema.optional(),
  requester_followups_enabled: z.boolean().nullable().optional(),
  requester_plan_review_enabled: z.boolean().nullable().optional(),
  cursor_api_key: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().min(1).max(512).optional(),
  ),
  allowed_origins: allowedOriginsSchema.optional(),
  host_runtime: z.enum(["vercel"]).nullable().optional(),
  auth_provider: z.enum(["supabase"]).nullable().optional(),
});
