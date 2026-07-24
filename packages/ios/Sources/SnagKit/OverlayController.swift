#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI
import UIKit

/// A window that only intercepts touches on Snag's own controls. Taps on
/// empty overlay area fall through to the host app.
final class SnagPassthroughWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let view = super.hitTest(point, with: event) else { return nil }
        if view === self || view === rootViewController?.view {
            return nil
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
