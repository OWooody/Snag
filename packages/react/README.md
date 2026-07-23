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
| `getRequester` | Display id for who filed the request — shown in the list; enables a **Mine** filter |
| `getAuthToken` | Send `Authorization: Bearer` when the user is logged in |
| `theme` | Override button/panel colors |
| `debug: true` | Log probe/request details to the console |

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
