# Snag

Tap the screen, it gets fixed.

Snag is an in-app change-request tool for development and staging web apps. A floating button lets anyone using an internal build describe a change on the screen they are looking at. Snag captures the request together with a screenshot and app context, and a multi-tenant relay backend launches an AI coding agent (currently Cursor Cloud Agents) against the project's repository. Status, branch, and PR links show up back inside the app.

This repo is standalone and unrelated to any host application.

## How it fits together

```
snag/
  packages/react/     # @snag/react — web SDK (npm package)
  apps/demo/          # Vite playground
  supabase/           # multi-tenant relay (own Supabase project)
  scripts/            # tenant provisioning
```

1. Host app calls `initSnag({ endpoint, projectKey, ... })` and mounts `<SnagOverlay />` at the root.
2. On startup the SDK probes the relay once. The relay reports `{ enabled: true }` only when the project exists and is enabled — the server is the single visibility gate.
3. On button press the SDK captures a screenshot (before the panel opens), the user types the request, and the SDK POSTs it to the relay.
4. The relay stores the request, launches a cloud agent with the prompt, screenshot, and context, and receives status webhooks. The in-app request list shows status, branch, and PR links.

## Quick start

### 1. Set up the relay (Supabase)

```sh
cd snag
supabase link --project-ref <your-ref>
supabase db push
supabase secrets set SNAG_KEY_ENCRYPTION_SECRET=<32+ char random>
supabase secrets set SNAG_WEBHOOK_SECRET=<random>
supabase functions deploy relay --no-verify-jwt
supabase functions deploy webhook --no-verify-jwt
```

### 2. Provision a tenant

```sh
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SNAG_KEY_ENCRYPTION_SECRET=... \
deno run --allow-env --allow-net scripts/create-project.ts \
  --name "My App" \
  --slug my-app \
  --repo-url https://github.com/org/repo \
  --cursor-api-key key_xxx \
  --prompt-instructions "The app lives in src/. Read README.md before changing anything."
```

The script prints a `snag_pk_...` publishable key.

### 3. Install the SDK in your app

```sh
npm install @snag/react
# or for local testing:
npm pack packages/react && npm install ./snag-react-0.1.0.tgz
```

```tsx
import { initSnag, SnagOverlay } from "@snag/react";

initSnag({
  endpoint: "https://<your-project>.supabase.co/functions/v1/relay",
  projectKey: "snag_pk_...",
  getContext: () => ({
    route: window.location.pathname,
    environment: "staging",
    app_version: "1.0.0",
  }),
});

// In your root component:
<SnagOverlay />
```

### 4. Run the demo

```sh
cp apps/demo/.env.example apps/demo/.env
# fill in endpoint + project key
npm install
npm run dev
```

## Security model

- The **publishable key** (`snag_pk_...`) is visible in the JS bundle — treat it like a Segment write key, not a secret.
- **Visibility gating** is server-side: disable a project (`enabled = false`) or delete it and the button disappears everywhere.
- **Rate limits** are per-project and per-IP (defaults: 10/hour per IP, 10/hour per project, 30/day per project).
- **Cursor API keys** are encrypted at rest (AES-256-GCM) with `SNAG_KEY_ENCRYPTION_SECRET`.
- **Screenshots** show real screen content — only enable Snag in environments with non-sensitive/seeded data.
- Never log prompt or screenshot contents on the relay — entity IDs only.

## Future packages

`@snag/react` is the first SDK. A framework-agnostic `@snag/core` / `@snag/vanilla` can be added later without renaming anything.

See [packages/react/README.md](packages/react/README.md) for SDK details.
