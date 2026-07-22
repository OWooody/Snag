# Snag operations guide

How to run the Snag backend and onboard new apps (tenants). Host-app teams only need [packages/react/README.md](../packages/react/README.md).

**Architecture:** one Supabase project, one relay. Each host app is a row in `snag_projects` with its own `snag_pk_...` key, repo URL, and agent config.

| Item | Value (Snag instance) |
|------|------------------------|
| Project ref | `lsssxrpkecgapxbfqgcj` |
| Relay URL | `https://lsssxrpkecgapxbfqgcj.supabase.co/functions/v1/relay` |
| Webhook URL | `https://lsssxrpkecgapxbfqgcj.supabase.co/functions/v1/webhook` |

---

## One-time backend setup

Do this once per Snag Supabase project.

### 1. Link CLI

Use the Supabase account that owns this project. If you use a separate account from other work, set a PAT per repo:

```sh
# .env.supabase.local (gitignored)
export SUPABASE_ACCESS_TOKEN="sbp_..."
```

```sh
cd snag
source .env.supabase.local   # optional
supabase login               # or rely on PAT above
supabase link --project-ref lsssxrpkecgapxbfqgcj
```

### 2. Push schema

```sh
supabase db push
```

Migration: `supabase/migrations/00001_snag_core.sql` → tables `snag_projects`, `snag_requests`.

If policies already exist from a partial run:

```sh
supabase migration repair 00001 --status applied
```

### 3. Set Edge Function secrets

```sh
openssl rand -base64 32   # SNAG_KEY_ENCRYPTION_SECRET — save this
openssl rand -base64 24   # SNAG_WEBHOOK_SECRET
```

```sh
supabase secrets set \
  SNAG_KEY_ENCRYPTION_SECRET="<32+ char secret>" \
  SNAG_WEBHOOK_SECRET="<webhook secret>"
```

Keep `SNAG_KEY_ENCRYPTION_SECRET` — you need the **same value** when provisioning tenants.

### 4. Deploy functions

```sh
supabase functions deploy relay --no-verify-jwt
supabase functions deploy webhook --no-verify-jwt
```

In dashboard: **Edge Functions → each function → disable “Enforce JWT verification”.**

Must deploy via CLI so `../_shared/` imports resolve (dashboard single-file paste won’t work).

### 5. Register Cursor webhook (optional)

Point Cursor Cloud Agents webhooks at the webhook URL above, using the same `SNAG_WEBHOOK_SECRET`. Without this, status still refreshes via GET polling (~3 min stale).

---

## Onboard a new app (tenant)

Run once per host application / repository.

### 1. Provision tenant

Service role key: **Dashboard → Settings → API → service_role**.

```sh
SUPABASE_URL="https://lsssxrpkecgapxbfqgcj.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role>" \
SNAG_KEY_ENCRYPTION_SECRET="<same secret as Edge Function secrets>" \
deno run --allow-env --allow-net scripts/create-project.ts \
  --name "Acme Web" \
  --slug acme-web \
  --repo-url "https://github.com/org/repo" \
  --cursor-api-key "key_..." \
  --ref main \
  --prompt-instructions "Read README.md. App entry is apps/web/. Use existing conventions."
```

The script prints JSON with `publishable_key` (`snag_pk_...`).

**Important:**

- `SNAG_KEY_ENCRYPTION_SECRET` must match Edge Function secrets exactly.
- `repo-url` and `repo-ref` must match GitHub (branch must exist with commits).
- Cursor API key must have access to the repo (connect GitHub in Cursor for private repos).

### 2. Hand off to the host team

Send them:

| Value | Example |
|-------|---------|
| `endpoint` | `https://lsssxrpkecgapxbfqgcj.supabase.co/functions/v1/relay` |
| `projectKey` | `snag_pk_...` from provisioning |

They follow [packages/react/README.md](../packages/react/README.md).

### 3. Verify

```sh
curl -s -H "x-snag-key: snag_pk_..." \
  "https://lsssxrpkecgapxbfqgcj.supabase.co/functions/v1/relay"
```

Expected: `{"enabled":true,"requests":[]}`

---

## Publish SDK to npm

Package: **`@snag-tech/react`** (public scoped package, npm org `snag-tech`).

### Prerequisites

1. [npm account](https://www.npmjs.com/signup)
2. **Own the `@snag-tech` scope** — org at [npmjs.com/org/snag-tech](https://www.npmjs.com/org/snag-tech).
3. Log in: `npm login`

### Publish

From the monorepo root or `packages/react`:

```sh
cd packages/react
npm run build
npm publish --access public
```

`prepublishOnly` runs `build` automatically. Bump version before republishing:

```sh
npm version patch   # 0.1.0 → 0.1.1
npm publish --access public
```

### Host app install (after publish)

```sh
npm install @snag-tech/react
```

### Local tarball (before publish or for private handoff)

```sh
cd packages/react
npm pack
# → snag-react-0.1.0.tgz

npm install /path/to/snag/packages/react/snag-react-0.1.0.tgz
```

---

## Day-2 operations

### Kill switch (disable one app)

```sql
UPDATE snag_projects SET enabled = false WHERE slug = 'acme-web';
```

Button disappears everywhere for that key within the next probe.

### Update repo or branch

```sql
UPDATE snag_projects
SET repo_url = 'https://github.com/org/repo', repo_ref = 'main'
WHERE slug = 'acme-web';
```

### Rate limits

```sql
UPDATE snag_projects
SET per_ip_hourly_limit = 10, hourly_limit = 10, daily_limit = 30
WHERE slug = 'acme-web';
```

### List tenants

```sql
SELECT slug, name, publishable_key, enabled, repo_url, repo_ref FROM snag_projects;
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Probe `enabled: false` | Wrong/missing key, no tenant row, or `enabled = false` |
| Relay **500** | `SNAG_KEY_ENCRYPTION_SECRET` mismatch vs tenant creation; check relay logs |
| Agent launch: branch not found | Wrong `repo_ref`, repo not on GitHub, or no commits on branch |
| Agent launch: repo access | Cursor key can’t see private repo — link GitHub in Cursor |
| Webhook silent | `SNAG_WEBHOOK_SECRET` unset; GET polling still works |
| `db push` policy exists | `supabase migration repair 00001 --status applied` |

### Relay logs

**Dashboard → Edge Functions → relay → Logs** — look for `snag-relay error:`.

---

## Security

- **Never** commit `service_role`, Cursor API keys, or `SNAG_KEY_ENCRYPTION_SECRET`.
- `snag_pk_...` is public in the host app bundle — rate limits and `enabled` flag are the guardrails.
- Cursor keys are AES-256-GCM encrypted at rest in `cursor_api_key_encrypted`.
- Relay logs entity IDs only — not prompts or screenshots.
- Only enable Snag on staging/internal builds with non-sensitive data.
