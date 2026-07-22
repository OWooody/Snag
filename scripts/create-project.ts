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
 *     [--prompt-instructions "Repo orientation text..."]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

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

function generatePublishableKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `snag_pk_${token}`;
}

async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: ALGORITHM },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    encoder.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

const args = parseArgs(Deno.args);
const name = args.name;
const slug = args.slug;
const repoUrl = args["repo-url"];
const cursorApiKey = args["cursor-api-key"];
const repoRef = args.ref ?? "main";
const model = args.model ?? null;
const promptInstructions = args["prompt-instructions"] ?? "";

if (!name || !slug || !repoUrl || !cursorApiKey) {
  console.error(
    "Required: --name --slug --repo-url --cursor-api-key\nOptional: --ref --model --prompt-instructions",
  );
  Deno.exit(1);
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const encryptionSecret = Deno.env.get("SNAG_KEY_ENCRYPTION_SECRET");

if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SNAG_KEY_ENCRYPTION_SECRET",
  );
  Deno.exit(1);
}

if (encryptionSecret.length < 32) {
  console.error("SNAG_KEY_ENCRYPTION_SECRET must be at least 32 characters");
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
    enabled: true,
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
