# SnagKit (iOS)

Add an in-app "fix this" button to your staging or internal iOS build. Testers describe a change on the screen they're looking at; Snag sends it (with a screenshot) to your team's coding agent.

**You need two values from your Snag admin** before you start:

- `endpoint` — relay URL
- `projectKey` — your app's `snag_pk_...` key

Your admin must also add your app's **bundle identifier** to the project allowlist as `app://<bundle-id>` (e.g. `app://com.example.myapp`) — the native analog of the web origin allowlist. Without it, the button never appears.

---

## 1. Install (Swift Package Manager)

In Xcode: **File → Add Package Dependencies…** and enter this repository's URL. Or in `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/OWooody/snag", from: "0.1.0")
]
```

Then add `SnagKit` to your target's dependencies.

Requires **iOS 15+**.

---

## 2. Add one call at startup

Only call this in **dev/staging** builds — or call it everywhere and let the server gate visibility (nothing renders unless the project is enabled and your bundle ID is allowlisted).

**SwiftUI:**

```swift
import SnagKit
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    Snag.start(
                        endpoint: URL(string: "https://<project-ref>.supabase.co/functions/v1/relay")!,
                        projectKey: "snag_pk_...",
                        requester: { "demo-user" },
                        context: { ["environment": "staging"] }
                    )
                }
        }
    }
}
```

**UIKit:**

```swift
import SnagKit

func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
) -> Bool {
    Snag.start(
        endpoint: URL(string: "https://<project-ref>.supabase.co/functions/v1/relay")!,
        projectKey: "snag_pk_..."
    )
    return true
}
```

No view code needed — SnagKit attaches its own passthrough window above your app.

---

## That's it

- If the project is enabled and your bundle ID is allowlisted, a floating button appears over every screen.
- If not, nothing renders — safe to ship the call in all builds.
- Tapping the button captures a screenshot (the overlay itself is never in it), then opens a panel to describe the change and track past requests (status, branch, PR link).
- To turn Snag off remotely, your admin disables the project — no app update needed.

---

## Optional

| Option | What it does |
|--------|----------------|
| `context` | Async closure attaching environment, feature flags, etc. to every request (merged on top of auto-captured `snag_auto`: app version, device, OS, screen, locale, current view controller) |
| `requester` | Async closure returning a display id for who filed the request — shown in the list; **Mine** defaults on when set. When follow-ups are on, **Needs you** also defaults on (`needs_input` and requests waiting for your confirmation) |
| `requesterToken` | Async closure returning a signed requester token from your backend, sent as `x-snag-requester-token`. Verifies who filed the request — required for execute-mode auto-merge (see below) |
| `theme` | Override button/panel colors (`SnagTheme`) |
| `debug: true` | Log probe/request details to the console |

### Execute mode: checking your own change

When your admin enables execute mode with **Preview, then merge**, a request moves to **Ready for you to check** once the preview deployment is up. Open the preview from the request card, then tap **Looks right** (Snag merges it once CI passes and it goes live) or **Not right** with what should change (the agent revises the same PR). The floating button's badge counts these requests too.

### Verified requesters (signed token)

Execute-mode auto-merge only applies to requesters Snag can verify. Your admin generates a **requester signing secret** in the Snag admin panel; your backend signs a short-lived token for the logged-in user, and the app passes it to Snag. Example signer (Node):

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

```swift
Snag.start(
    endpoint: relayURL,
    projectKey: "snag_pk_...",
    requester: { await session.currentUserId },
    // Fetch from your backend and cache until shortly before it expires.
    requesterToken: { await session.snagRequesterToken() }
)
```

When the token verifies, its `sub` replaces `requester` as the stored requester, so return the same id from both to keep **Mine** working. An invalid or expired token is ignored (the request is filed as unverified) — it never blocks filing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No button | Confirm the project is enabled and `app://<your-bundle-id>` is in the allowlist; run with `debug: true` and check the console |
| Button was working, now gone | Admin may have disabled the project — contact them |
| Request fails | Usually repo/agent config on the admin side — send them the error |

---

## Security note

`projectKey` ships inside your app binary (like an analytics write key). Only use Snag on **non-production** builds with **non-sensitive** data — screenshots capture the real screen. Do not put secrets or PII in `context` or `requester`.

---

## Development

The package manifest lives at the **repo root** (`Package.swift`) because SwiftPM resolves git dependencies from the repository root; sources are under `packages/ios/Sources/SnagKit`. The protocol/client/context core is platform-portable and covered by tests (`swift test` works on macOS and Linux); the overlay UI compiles for iOS only.

Releasing a new version is just a semver git tag:

```sh
git tag 0.1.1 && git push origin 0.1.1
```
