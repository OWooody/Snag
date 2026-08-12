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
| `requester` | Async closure returning a display id for who filed the request — shown in the list; **Mine** defaults on when set. When follow-ups are on, **Needs reply** also defaults on (only `needs_input`) |
| `theme` | Override button/panel colors (`SnagTheme`) |
| `debug: true` | Log probe/request details to the console |

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
