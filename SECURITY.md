# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement within a few days, and a fix or mitigation plan once the report is confirmed.

## Supported versions

| Component | Supported |
|-----------|-----------|
| `@snag-tech/react` | Latest minor release |
| SnagKit (iOS) | Latest release |
| Relay (`supabase/functions`) and admin panel | `main` |

## How Snag handles data

- The **publishable key** (`snag_pk_...`) is visible in the JS bundle or app binary. Treat it like a Segment write key, not a secret.
- **Origin allowlist**: each project has `allowed_origins`, and an empty list denies all. Web clients are matched by `Origin` / `Referer`; native apps send their bundle ID as `x-snag-app-id` and are matched against `app://<bundle-id>` entries.
- **Rate limits**: per-IP, hourly, and daily caps are enforced in the relay before an agent launches.
- **Visibility gating** is server-side. Disable a project (`enabled = false`) or delete it and the tab disappears everywhere.
- **Secrets at rest**: Cursor API keys, GitHub tokens, Origin app keys and requester signing secrets are encrypted with AES-256-GCM using `SNAG_KEY_ENCRYPTION_SECRET`.
- **Screenshots** are sent to the coding agent with the request. The relay stores only whether one was included, and logs entity IDs only, never prompts or screenshots.
- **Recent steps** contain route paths and short control labels. Values that look like emails, tokens or secrets are redacted in the browser, and the relay checks again.
- **Auto-merge** applies only to verified requesters (signed tokens) on a trusted list, after CI passes. Branch protection on the host repository is the final guardrail; see [docs/OPERATIONS.md](docs/OPERATIONS.md#branch-protection).

Only enable Snag in environments with non-sensitive or seeded data. Screenshots show real screen content.
