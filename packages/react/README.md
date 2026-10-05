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

- If env vars are set and your project is enabled, a slim glass tab appears at the bottom center of the screen. Hover (or tab to it with the keyboard) and it rises to show **What's on your mind?**; click or tap to open the request panel.
- The tab's line shows status at a glance. It glows red when requests are waiting on you, turns green when a request finished since you last opened **Requests**, and shows a purple sweep while one of your requests is queued or running (in that order of priority). Hovering turns red and green into counts, side by side when both apply. Which finished requests you've seen is remembered in `localStorage`, per requester.
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
| `theme` | Override tab/panel colors (`accent` drives the in-progress sweep, `danger` the waiting-on-you glow, `success` the finished state) |
| `debug: true` | Log probe/request details to the console |
| `markers: false` | Hide the numbered pins that mark open requests on the page |

### Pointing at an element

Next to **Mark up** on the screenshot, **Select elements** lets the tester click the exact things they mean (up to 8 per request). The picker stays open: hover highlights the element under the cursor, click adds it with a numbered badge, and clicking it again removes it. ↑ / ↓ move to the parent / child, Enter or **Done** finishes, Esc cancels. On touch screens, tap an element and then **Add**.

Each pick is sent as `elements` on the request, and a numbered box is drawn on the screenshot. A pick includes a CSS selector, the visible text, identifying attributes (`aria-label`, `data-testid`, `href` without its query string, `class`, …), and its position. When the page runs a React development build, it also includes the nearest component names and the source file of the element's JSX. Form field values are never read.

Production builds strip React's debug info and minify component names, so there the agent relies on the selector, text and attributes. Adding `data-testid` to key elements makes picks much easier to trace back to code.

When a request points at an element, a numbered pin stays next to that element on the same page until the request is done, so others see it's already asked for. Clicking the pin opens the request. If the element is no longer on the page, the pin sits where it was when the request was filed. Pins follow client-side navigation and only show on the page the request was filed from (matched by `location.pathname`).

### Answering questions and staying in the loop

When the agent has questions, the request card shows them with tappable answers (plus a free-text **Other** where it makes sense). **Reply in your own words** switches back to a single text box. While a request is queued or running, the SDK checks for updates every few seconds and the card shows its progress steps (Planning, Building, Delivering).

Requests filed from this browser raise a short toast when they need you or finish, and the tab title shows a count while the page is in the background. After the first request, Snag offers browser notifications once; if the tester allows them, those updates arrive as system notifications while the tab is in the background. The ids of requests filed here are kept in `localStorage`.

### Execute mode: reviewing the plan

When your admin turns on **Requester plan review**, a request stops at **Review the plan** after the agent plans it. The card lists what will change in plain language. **Looks right, build it** hands the plan to Snag's rules (a developer may still need to approve it), and **Adjust** sends what should be different so the agent revises the plan. When the plan is a visual or copy change, **Show me the expected result** applies an approximate version to the page you're on (styles, text, hiding, reordering siblings, and a few attributes) until you tap **Back to plan**. It never runs code or inserts HTML, and the real change may look a little different. The iOS SDK does not show this step yet, so keep it off for projects whose testers use the iOS app.

### Execute mode: checking your own change

When your admin enables execute mode with **Preview, then merge**, a request moves to **Ready for you to check** once the preview deployment is up. Open the preview from the request card, then tap **Looks right** (Snag merges it once CI passes and it goes live) or **Not right** with what should change (the agent revises the same PR). The tab's red waiting-on-you count includes these requests too.

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
