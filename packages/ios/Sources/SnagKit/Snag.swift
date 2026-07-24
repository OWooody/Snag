#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI
import UIKit

public struct SnagConfiguration {
    /// Relay URL implementing the Snag protocol (see `SnagProtocol.swift`).
    public var endpoint: URL
    /// Per-project publishable key (`snag_pk_...`). Sent as `x-snag-key` on
    /// every request. Identifies the tenant and gates visibility server-side.
    public var projectKey: String
    /// Optional display id for who filed the request (email, username, etc.).
    /// Sent as `x-snag-requester` and shown in the in-app request list —
    /// keep it free of secrets.
    public var requester: (() async -> String?)?
    /// Host context attached to every request: current screen, environment
    /// name, feature flags, etc. Keep it free of personal data — it is
    /// forwarded verbatim to the coding agent. Merged on top of the
    /// auto-captured `snag_auto` (app version, device, OS, ...).
    public var context: (() async -> [String: Any])?
    public var theme: SnagTheme
    /// Enable console debug logging.
    public var debug: Bool

    public init(
        endpoint: URL,
        projectKey: String,
        requester: (() async -> String?)? = nil,
        context: (() async -> [String: Any])? = nil,
        theme: SnagTheme = SnagTheme(),
        debug: Bool = false
    ) {
        self.endpoint = endpoint
        self.projectKey = projectKey
        self.requester = requester
        self.context = context
        self.theme = theme
        self.debug = debug
    }
}

/// Entry point. Call `Snag.start(...)` once after launch — from
/// `application(_:didFinishLaunchingWithOptions:)`, a SwiftUI `App` init, or
/// the first `onAppear`. Nothing renders until the relay probe confirms the
/// project is enabled — the server is the single visibility gate, so this is
/// safe to call unconditionally in every build.
public enum Snag {
    @MainActor
    public static func start(_ configuration: SnagConfiguration) {
        OverlayController.shared.start(configuration: configuration)
    }

    @MainActor
    public static func start(
        endpoint: URL,
        projectKey: String,
        requester: (() async -> String?)? = nil,
        context: (() async -> [String: Any])? = nil,
        theme: SnagTheme = SnagTheme(),
        debug: Bool = false
    ) {
        start(
            SnagConfiguration(
                endpoint: endpoint,
                projectKey: projectKey,
                requester: requester,
                context: context,
                theme: theme,
                debug: debug
            )
        )
    }

    /// Tear down the overlay. Mostly useful for tests and previews.
    @MainActor
    public static func stop() {
        OverlayController.shared.stop()
    }
}
#endif
