# Contributing to Snag

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Setup

Requires Node 18+. The relay tests also need [Deno](https://deno.com).

```sh
npm install
npm run dev          # demo app at http://localhost:5173
npm run dev:admin    # admin panel
```

To work on the overlay UI without a relay, open [http://localhost:5173/preview](http://localhost:5173/preview). It renders the request sheet from `packages/react/src` with sample requests.

To run the full stack against your own Supabase project, follow [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Where things live

| Area | Path |
|------|------|
| React SDK | `packages/react` |
| iOS SDK (SnagKit) | `packages/ios`, manifest at the root `Package.swift` |
| Shared types and schemas | `packages/shared` |
| Relay, webhook and delivery worker | `supabase/functions` |
| Database migrations | `supabase/migrations` |
| Admin panel | `apps/admin` |
| Demo video source | `marketing/video` |

## Before you open a pull request

```sh
npm run typecheck
npm test -w @snag/shared
deno test supabase/functions
```

- Keep each pull request to one change, and describe what it does for the person using Snag.
- Write commit messages as a full sentence about the user-facing change, like the existing history: "Let a requester close a request that is still open."
- Add a new migration rather than editing an existing one.
- If you change what the SDK sends or the relay accepts, update both sides and the docs in `packages/react/README.md` or `packages/ios/README.md`.
- Never commit secrets. Keys belong in `.env` files, which are gitignored.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened. Include the SDK version and, for web, the browser. For security issues, follow [SECURITY.md](SECURITY.md) instead.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
