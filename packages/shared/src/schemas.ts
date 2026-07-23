import { z } from "zod";
import { AGENT_MODES } from "./agent-mode";

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
  .refine((url) => url.startsWith("https://github.com/"), {
    message: "Repository URL must be a GitHub HTTPS URL",
  });

export const promptInstructionsSchema = z.string().max(4000).default("");

export const rateLimitSchema = z.number().int().positive().max(1000);

export const agentModeSchema = z.enum(AGENT_MODES);

export const projectAgentModeOverrideSchema = agentModeSchema.nullable();

export const companyProjectUpdateSchema = z.object({
  repo_url: repoUrlSchema,
  repo_ref: z.string().trim().min(1).max(256),
  model: z.string().trim().max(128).nullable().optional(),
  prompt_instructions: promptInstructionsSchema,
  enabled: z.boolean(),
  agent_mode: projectAgentModeOverrideSchema.optional(),
});

export const companyOrganizationUpdateSchema = z.object({
  organization_id: z.string().uuid(),
  agent_mode: agentModeSchema,
});

export const cursorKeyUpdateSchema = z.object({
  cursor_api_key: z.string().trim().min(1).max(512),
});

export const createTenantSchema = z.object({
  org_name: z.string().trim().min(1).max(128),
  org_slug: slugSchema,
  project_name: z.string().trim().min(1).max(128),
  project_slug: slugSchema,
  repo_url: repoUrlSchema,
  repo_ref: z.string().trim().min(1).max(256).default("main"),
  model: z.string().trim().max(128).nullable().optional(),
  prompt_instructions: promptInstructionsSchema,
  cursor_api_key: z.string().trim().min(1).max(512),
  owner_email: z.string().trim().email(),
  per_ip_hourly_limit: rateLimitSchema.default(10),
  hourly_limit: rateLimitSchema.default(10),
  daily_limit: rateLimitSchema.default(30),
  agent_mode: agentModeSchema.default("plan_only"),
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
  cursor_api_key: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().min(1).max(512).optional(),
  ),
});
