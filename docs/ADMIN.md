# Snag Admin Panel

Web admin for Snag platform operators and company admins.

## Prerequisites

- Node.js 18+
- Supabase project with migrations applied (`00001_snag_core.sql`, `00002_admin_auth.sql`)
- Same `SNAG_KEY_ENCRYPTION_SECRET` as Edge Functions

## Local setup

```sh
cd snag
npm install
cp apps/admin/.env.example apps/admin/.env.local
# Fill in Supabase URL, anon key, service role key, encryption secret
npm run dev:admin
```

Open http://localhost:3000

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key for auth + RLS reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only mutations |
| `SNAG_KEY_ENCRYPTION_SECRET` | Yes | Must match Edge Function secret (32+ chars) |
| `NEXT_PUBLIC_SNAG_RELAY_URL` | No | Defaults to `{SUPABASE_URL}/functions/v1/relay` |
| `NEXT_PUBLIC_ADMIN_URL` | No | Used in invite emails (default `http://localhost:3000`) |

## Bootstrap platform admin

1. Sign in once via magic link at `/login`
2. Find your user ID in Supabase Dashboard → Authentication → Users
3. Run in SQL editor:

```sql
INSERT INTO snag_platform_admins (user_id)
VALUES ('your-user-uuid-here')
ON CONFLICT DO NOTHING;
```

4. Refresh the admin app — Platform section appears in the sidebar

## Deploy (Vercel)

1. Create a Vercel project with **Root Directory** set to `apps/admin`
2. The included [`apps/admin/vercel.json`](../apps/admin/vercel.json) installs and builds from the monorepo root so `@snag/shared` resolves correctly
3. Set all environment variables above
4. In Supabase Dashboard → Authentication → URL Configuration:
   - Site URL: your Vercel domain
   - Redirect URLs: `https://your-domain.vercel.app/auth/callback`

If the build fails with `Can't resolve '@snag/shared'`, confirm Root Directory is `apps/admin` (not repo root) and that `vercel.json` is present — it runs `npm install` from the repository root before building.

## Roles

| Role | Access |
|------|--------|
| Platform admin | All tenants, create/edit/disable, global requests, read-only impersonation |
| Company owner/admin | Their org's project: settings, cursor key, requests, integration |
| Company viewer | Read-only dashboard, requests, integration |

## Security notes

- Service role and encryption secret are server-only — never expose to the browser
- Cursor API keys are write-only in the UI; stored AES-256-GCM encrypted
- Publishable key rotation is platform-admin only in v1
- **Allowed origins** — company admins (Settings) and platform admins (tenant edit) manage per-project origin allowlists; **empty list blocks all origins** until configured
- **Rate limits** — platform admins set per-IP/hourly/daily caps when creating or editing a tenant
- Impersonation is read-only; start/stop events are written to `snag_audit_log`
