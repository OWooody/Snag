#!/usr/bin/env -S deno run --allow-env --allow-net

/**
 * Provision a new Snag tenant (project).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SNAG_KEY_ENCRYPTION_SECRET=... \
 *   deno run --allow-env --allow-net scripts/create-project.ts \
 *     --name "My App" \
 *     --slug my-app \
 *     --repo-url https://github.com/org/repo \
 *     --cursor-api-key key_xxx \
 *     [--ref main] \
 *     [--model claude-sonnet] \
 *     [--prompt-instructions "Repo orientation text..."] \
 *     [--allowed-origins "https://staging.example.com,http://localhost:3000,app://com.example.app"]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEncryptionSecret, encryptSecret } from "../packages/shared/src/crypto.ts";
import { generatePublishableKey } from "../packages/shared/src/keys.ts";
import { normalizeAllowedEntry } from "../packages/shared/src/origins.ts";

function parseAllowedOriginsArg(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const normalized = normalizeAllowedEntry(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}`);
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

const args = parseArgs(Deno.args);
const name = args.name;
const slug = args.slug;
const repoUrl = args["repo-url"];
const cursorApiKey = args["cursor-api-key"];
const repoRef = args.ref ?? "main";
const model = args.model ?? null;
const promptInstructions = args["prompt-instructions"] ?? "";
const allowedOrigins = parseAllowedOriginsArg(args["allowed-origins"]);

if (!name || !slug || !repoUrl || !cursorApiKey) {
  console.error(
    "Required: --name --slug --repo-url --cursor-api-key\nOptional: --ref --model --prompt-instructions --allowed-origins",
  );
  Deno.exit(1);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const encryptionSecret = assertEncryptionSecret(
  Deno.env.get("SNAG_KEY_ENCRYPTION_SECRET"),
);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const publishableKey = generatePublishableKey();
const cursorApiKeyEncrypted = await encryptSecret(cursorApiKey, encryptionSecret);

const client = createClient(supabaseUrl, serviceRoleKey);
const { data, error } = await client
  .from("snag_projects")
  .insert({
    name,
    slug,
    publishable_key: publishableKey,
    repo_url: repoUrl,
    repo_ref: repoRef,
    model,
    cursor_api_key_encrypted: cursorApiKeyEncrypted,
    prompt_instructions: promptInstructions,
    allowed_origins: allowedOrigins,
    enabled: true,
    cursor_key_updated_at: new Date().toISOString(),
  })
  .select("id, slug, publishable_key")
  .single();

if (error || !data) {
  console.error("Failed to create project:", error);
  Deno.exit(1);
}

console.log("Project created:");
console.log(JSON.stringify(data, null, 2));
console.log("");
console.log("SDK init:");
console.log(
  `initSnag({ endpoint: "${supabaseUrl}/functions/v1/relay", projectKey: "${data.publishable_key}" })`,
);
