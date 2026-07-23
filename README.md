# Snag

Tap the screen, it gets fixed.

Snag is an in-app change-request tool for development and staging web apps. A floating button lets anyone using an internal build describe a change on the screen they are looking at. Snag captures the request together with a screenshot and app context, and a multi-tenant relay backend launches an AI coding agent (currently Cursor Cloud Agents) against the project's repository. Status, branch, and PR links show up back inside the app.

## Documentation

| Who | Read this |
|-----|-----------|
| **Host app team** (integrating Snag into their React app) | [packages/react/README.md](packages/react/README.md) |
| **Snag admin** (backend, tenants, deploy) | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| **Admin panel** (web UI for operators and companies) | [docs/ADMIN.md](docs/ADMIN.md) |

## Repo layout

```
snag/
  packages/react/     # @snag-tech/react — web SDK
  packages/shared/    # @snag/shared — types, schemas, crypto
  apps/demo/          # Vite playground
  apps/admin/         # Next.js admin panel
  supabase/           # multi-tenant relay
  scripts/            # tenant provisioning (create-project.ts)
  docs/               # operations guide
```

## How it works

1. Host app calls `initSnag({ endpoint, projectKey, ... })` and mounts `<SnagOverlay />` at the root.
2. On startup the SDK probes the relay once. The relay reports `{ enabled: true }` only when the project exists and is enabled — the server is the single visibility gate.
3. On button press the SDK captures a screenshot (before the panel opens), the user types the request, and the SDK POSTs it to the relay.
4. The relay stores the request, launches a cloud agent with the prompt, screenshot, and context, and receives status webhooks. The in-app request list shows status, branch, and PR links.

## Demo

```sh
cp apps/demo/.env.example apps/demo/.env
# fill in endpoint + project key (from docs/OPERATIONS.md)
npm install
npm run dev
```

## Security

- The **publishable key** (`snag_pk_...`) is visible in the JS bundle — treat it like a Segment write key, not a secret.
- **Origin allowlist** — per-project `allowed_origins`; empty denies all, listed origins only are accepted (managed in the admin panel).
- **Rate limits** — per-IP, hourly, and daily caps enforced server-side before launching an agent.
- **Visibility gating** is server-side: disable a project (`enabled = false`) or delete it and the button disappears everywhere.
- **Cursor API keys** are encrypted at rest (AES-256-GCM) with `SNAG_KEY_ENCRYPTION_SECRET`.
- **Screenshots** show real screen content — only enable Snag in environments with non-sensitive/seeded data.
