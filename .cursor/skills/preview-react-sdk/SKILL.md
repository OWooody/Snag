---
name: preview-react-sdk
description: >-
  Preview the Snag React overlay from source before shipping SDK UI. Use when
  changing the request sheet, scrollbar, requests list, or any component in
  packages/react, and before publishing @snag-tech/react.
---

# Preview the React SDK

The review surface is the demo preview, not a Cursor canvas. It mounts `RequestPanel` from `packages/react/src` with fixture rows. No relay and no package rebuild.

## Review

1. From the repo root, start the demo if it is not already running: `npm run dev` (Vite on port 5173).
2. Open [http://localhost:5173/preview](http://localhost:5173/preview).
3. Wait until the sheet has finished opening, then check the real UI:
   - Requests list scrolls, and the thumb sits inside the frosted sheet.
   - Card text is not clipped by the scrollbar.
   - Needs you, Mine, and Refresh still filter the fixture rows.
   - New request tab still renders.
   - Close, then Open sheet, still opens the same panel.
4. Say what you checked and anything that looked wrong. Do not treat a code read as the review.

Fixture data and the fetch stub live in `apps/demo/src/preview.tsx`. The signed-in requester is `preview@snag.dev`. One queued row belongs to someone else so Mine can be turned off.
