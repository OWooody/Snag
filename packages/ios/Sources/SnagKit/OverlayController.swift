#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI
import UIKit

/// A window that only intercepts touches on Snag's own controls. Taps on
/// empty overlay area fall through to the host app.
///
/// The decision is point-based: SwiftUI renders the whole overlay inside a
/// single `_UIHostingView` (gestures are recognizers on that view, not
/// subviews), so `hitTest` cannot distinguish the floating button from empty
/// space by view identity. Instead the window asks `interactiveFrame` — set
/// by `OverlayController` to the button's current frame in window
/// coordinates — and swallows only touches inside it.
final class SnagPassthroughWindow: UIWindow {
    /// Region the overlay should receive touches in, in window coordinates.
    /// Return nil to pass everything through (e.g. while the panel sheet is
    /// presented — presentation views are separate subviews and unaffected).
    var interactiveFrame: @MainActor () -> CGRect? = { nil }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let view = super.hitTest(point, with: event) else { return nil }
        if view === self || view === rootViewController?.view {
            guard let frame = interactiveFrame(), frame.contains(point) else {
                return nil
            }
            // Return the hosting view so its gesture recognizers get the touch.
            return view
        }
        return view
    }
}

/// Owns the overlay lifecycle: probe the relay once, and only when the
/// project is enabled attach a floating passthrough window above the app.
/// The native analog of `packages/react/src/components/snag-overlay.tsx`.
@MainActor
final class OverlayController {
    static let shared = OverlayController()

    private var window: SnagPassthroughWindow?
    private var model: OverlayModel?
    private var sceneObserver: NSObjectProtocol?
    private var startTask: Task<Void, Never>?

    private init() {}

    func start(configuration: SnagConfiguration) {
        stop()

        let client = RelayClient(
            endpoint: configuration.endpoint,
            projectKey: configuration.projectKey,
            appId: Bundle.main.bundleIdentifier,
            requesterProvider: configuration.requester,
            debug: configuration.debug
        )
        let model = OverlayModel(configuration: configuration, client: client)
        self.model = model

        startTask = Task { [weak self] in
            let state = await client.fetchState()
            guard state.enabled, !Task.isCancelled else { return }
            await model.resolveEnvironmentLabel()
            guard !Task.isCancelled else { return }
            self?.attachWhenSceneReady()
        }
    }

    func stop() {
        startTask?.cancel()
        startTask = nil
        removeSceneObserver()
        window?.isHidden = true
        window = nil
        model = nil
    }

    private func attachWhenSceneReady() {
        if let scene = activeScene() {
            attach(to: scene)
            return
        }
        // App may still be launching; wait for the first scene to activate.
        sceneObserver = NotificationCenter.default.addObserver(
            forName: UIScene.didActivateNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let scene = notification.object as? UIWindowScene else { return }
            Task { @MainActor in
                guard let self, self.window == nil else { return }
                self.removeSceneObserver()
                self.attach(to: scene)
            }
        }
    }

    private func attach(to scene: UIWindowScene) {
        guard let model, window == nil else { return }

        let host = UIHostingController(rootView: OverlayRootView(model: model))
        host.view.backgroundColor = .clear

        let window = SnagPassthroughWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        window.rootViewController = host
        window.isHidden = false
        window.interactiveFrame = { [weak model] in
            guard let model, !model.panelVisible else { return nil }
            // Slightly inflated for finger-friendliness.
            return model.buttonFrame?.insetBy(dx: -8, dy: -8)
        }
        self.window = window
        model.overlayWindow = window
    }

    private func activeScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }

    private func removeSceneObserver() {
        if let sceneObserver {
            NotificationCenter.default.removeObserver(sceneObserver)
        }
        sceneObserver = nil
    }
}

/// Shared state between the floating button and the request panel.
@MainActor
final class OverlayModel: ObservableObject {
    @Published var panelVisible = false
    @Published var screenshot: SnagScreenshot?
    /// Floating button frame in window coordinates, kept current by
    /// `FloatingButtonView` and read by `SnagPassthroughWindow.hitTest`.
    /// Deliberately not `@Published`: it changes every frame during a drag
    /// and must not trigger view invalidation.
    var buttonFrame: CGRect?

    let configuration: SnagConfiguration
    let client: RelayClient
    weak var overlayWindow: UIWindow?
    private(set) var environmentLabel = "dev"

    init(configuration: SnagConfiguration, client: RelayClient) {
        self.configuration = configuration
        self.client = client
    }

    var theme: SnagTheme { configuration.theme }

    func resolveEnvironmentLabel() async {
        let context = await resolveContext()
        if let environment = context["environment"] as? String, !environment.isEmpty {
            environmentLabel = environment
        }
    }

    func openPanel() {
        // Capture BEFORE the panel appears so it never shows in the screenshot.
        screenshot = ScreenshotCapturer.capture(excluding: overlayWindow)
        panelVisible = true
    }

    /// Merge auto-captured context with the host `context` provider.
    /// Host top-level keys win.
    func resolveContext() async -> [String: Any] {
        var host: [String: Any] = [:]
        if let provider = configuration.context {
            host = await provider()
        }
        return ContextBuilder.merge(auto: AutoContext.build(), host: host)
    }

    func requester() async -> String? {
        guard let provider = configuration.requester else { return nil }
        return await provider()
    }
}
#endif
