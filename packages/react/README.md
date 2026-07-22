# @snag/react

Snag React web SDK — an in-app floating button for development and staging builds that turns "can we change this?" into a running AI coding agent. The user describes the change on the screen they are looking at; Snag attaches a screenshot and app context and sends it to the Snag relay, which launches a cloud coding agent against the project's repository. Status, branch, and PR links show up back inside the app.

## Install

```sh
npm install @snag/react
```

Peer dependencies: `react >= 18`, `react-dom >= 18`.

## Usage

Initialize once and mount the overlay at your app root. It is safe to mount in every build: the overlay renders nothing unless the relay reports the project enabled.

```tsx
import { initSnag, SnagOverlay } from "@snag/react";

initSnag({
  endpoint: "https://<your-snag-relay>/functions/v1/relay",
  projectKey: "snag_pk_...",
  getContext: () => ({
    route: window.location.pathname,
    locale: document.documentElement.lang,
    app_version: "1.0.0",
    environment: "staging",
  }),
});

// In your root component tree:
<SnagOverlay />
```

## Visibility gating

There is deliberately no client-side environment flag. On startup the SDK sends one `GET` to `endpoint` with the `x-snag-key` header; the relay responds `{ enabled: true }` only when the project exists and is enabled. Any other response — 403, error, timeout — and the overlay renders nothing for the session. Disabling the project in the database is the remote kill switch.

## Relay contract

The SDK talks to a single endpoint implementing the protocol in `src/protocol.ts`:

- `GET endpoint` with `x-snag-key` → `{ enabled, requests? }`. Doubles as the enablement probe and the request-list fetch.
- `POST endpoint` with `CreateSnagRequestBody` — `{ prompt, context, screenshot?, locale? }` → `{ id, agent_url }`.

Optional header: `Authorization: Bearer <token>` when `getAuthToken` returns one.

## Screenshots

Captured with `html-to-image` at the moment the floating button is pressed — before the request panel opens, so the panel never appears in its own screenshot. Images are downscaled to at most 1000px wide and JPEG-compressed before upload. The user can exclude the screenshot with a toggle before submitting.

**Web caveats:** cross-origin images and iframes may be missing from captures. Only enable Snag in environments with non-sensitive/seeded data.

## Theming

Pass `theme` to `initSnag` to override any of the defaults in `src/theme.ts` (accent, background, surface, text colors).

## Local development

```sh
npm install
npm run build
```

To test in another project without publishing:

```sh
cd packages/react && npm pack
# in your project:
npm install /path/to/snag-react-0.1.0.tgz
```

Or use [yalc](https://github.com/wclr/yalc) for faster iteration.
