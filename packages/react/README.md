# @snag-tech/react

Add an in-app “fix this” button to your staging or internal build. Testers describe a change on the screen they’re looking at; Snag sends it (with a screenshot) to your team’s coding agent.

**You need two values from your Snag admin** before you start:

- `endpoint` — relay URL
- `projectKey` — your app’s `snag_pk_...` key

---

## 1. Install

```sh
npm install @snag-tech/react
```

Or from a tarball your admin provides:

```sh
npm install ./snag-react-0.1.0.tgz
```

Requires **React 18+**.

---

## 2. Add environment variables

Only set these in **dev/staging**. Leave them unset in production — the button won’t appear.

**Vite** (`.env.local`):

```env
VITE_SNAG_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/relay
VITE_SNAG_PROJECT_KEY=snag_pk_...
```

**Next.js** (`.env.local`):

```env
NEXT_PUBLIC_SNAG_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/relay
NEXT_PUBLIC_SNAG_PROJECT_KEY=snag_pk_...
```

Restart the dev server after changing env files.

---

## 3. Add two lines to your app

Call `initSnag` once at startup, then mount `<SnagOverlay />` at the root.

**Vite / CRA:**

```tsx
import { initSnag, SnagOverlay } from "@snag-tech/react";

initSnag({
  endpoint: import.meta.env.VITE_SNAG_ENDPOINT,
  projectKey: import.meta.env.VITE_SNAG_PROJECT_KEY,
  getContext: () => ({
    route: window.location.pathname,
    environment: "staging",
  }),
  getRequester: () => "demo-user",
});

export function App() {
  return (
    <>
      {/* your app */}
      <SnagOverlay />
    </>
  );
}
```

**Next.js** — use a client component (`"use client"`) and `NEXT_PUBLIC_*` env vars. Mount once in `layout.tsx`.

---

## That’s it

- If env vars are set and your project is enabled, a floating button appears.
- If not, nothing renders — safe to ship the code in all builds.
- To turn Snag off remotely, your admin disables the project — no deploy needed on your side.

---

## Optional

| Option | What it does |
|--------|----------------|
| `getContext` | Attach route, version, environment to every request (merged on top of auto-captured `snag_auto`) |
| `getRequester` | Display id for who filed the request — shown in the list; **Mine** defaults on when set. When follow-ups are on, **Needs you** also defaults on (`needs_input` and requests waiting for your confirmation) |
| `getRequesterToken` | Signed requester token from your backend, sent as `x-snag-requester-token`. Verifies who filed the request — required for execute-mode auto-merge (see below) |
| `getAuthToken` | Send `Authorization: Bearer` when the user is logged in |
| `theme` | Override button/panel colors |
| `debug: true` | Log probe/request details to the console |

### Execute mode: checking your own change

When your admin enables execute mode with **Preview, then merge**, a request moves to **Ready for you to check** once the preview deployment is up. Open the preview from the request card, then tap **Looks right** (Snag merges it once CI passes and it goes live) or **Not right** with what should change (the agent revises the same PR). The floating button's badge counts these requests too.

### Verified requesters (signed token)

Execute-mode auto-merge only applies to requesters Snag can verify. Your admin generates a **requester signing secret** in the Snag admin panel; your backend signs a short-lived token for the logged-in user and the SDK forwards it:

```ts
// Your backend — never ship the signing secret to the browser or the app.
import { createHmac } from "node:crypto";

export function signSnagRequesterToken(userId: string, ttlSeconds = 3600): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.SNAG_REQUESTER_SECRET!)
    .update(`v1.${payload}`)
    .digest("base64url");
  return `v1.${payload}.${signature}`;
}
```

Format: `v1.<base64url(JSON {sub, exp})>.<base64url(HMAC-SHA256(secret, "v1." + payload))>`, with `exp` in Unix seconds and at most 7 days ahead. `sub` must be printable ASCII, up to 128 characters, and should match the ids your admin puts on the **Trusted requesters** list.

```tsx
initSnag({
  endpoint: process.env.NEXT_PUBLIC_SNAG_ENDPOINT!,
  projectKey: process.env.NEXT_PUBLIC_SNAG_PROJECT_KEY!,
  getRequester: () => currentUser?.id ?? null,
  // Fetch from your backend and cache until shortly before it expires.
  getRequesterToken: () => fetchSnagRequesterToken(),
});
```

When the token verifies, its `sub` replaces `getRequester` as the stored requester, so return the same id from both to keep **Mine** working. An invalid or expired token is ignored (the request is filed as unverified) — it never blocks filing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No button | Check env vars, restart dev server, ask admin to confirm project is enabled |
| Button was working, now gone | Admin may have disabled the project — contact them |
| Request fails | Usually repo/agent config on the admin side — send them the error |

---

## Security note

`projectKey` is visible in your JS bundle (like an analytics write key). Only use Snag on **non-production** builds with **non-sensitive** data — screenshots capture the real screen. Do not put secrets or PII in `getContext` or `getRequester`.
