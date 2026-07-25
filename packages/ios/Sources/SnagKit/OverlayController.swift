#if canImport(UIKit) && canImport(SwiftUI)
import Combine
import SwiftUI
import UIKit

/// A window that only intercepts touches on Snag's own controls. Taps on
/// empty overlay area fall through to the host app.
///
/// The decision is identity-based: the floating button is a plain UIKit
/// subview (`SnagFloatingButtonView`), so `super.hitTest` returns it (or one
/// of its subviews) only when the touch is actually on the button. Touches
/// that resolve to the window itself or the empty SwiftUI hosting view are
/// passed through to the host app. Presented sheets live in their own
/// UIKit container views and stay interactive.
final class SnagPassthroughWindow: UIWindow {
    weak var floatingButton: SnagFloatingButtonView?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let view = super.hitTest(point, with: event) else { return nil }
        if view === self || view === rootViewController?.view {
            return nil
        }
        return view
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // Re-clamp after rotation/resize: autoresizing keeps a fixed
        // bottom-trailing gap, which can strand a previously dragged button
        // outside the new bounds.
        floatingButton?.clampToSuperviewBounds()
    }
}

/// UIKit-backed floating bubble. Deliberately not SwiftUI: the passthrough
/// window's hit testing is identity-based, and a real UIView guarantees
/// touches land on the button without syncing SwiftUI geometry frames to
/// UIKit window coordinates (which proved unreliable across layout passes).
final class SnagFloatingButtonView: UIView {
    private static let size: CGFloat = 52
    private static let edge: CGFloat = 12
    private static let bottomInset: CGFloat = 80

    private let onTap: () -> Void
    private var panStartCenter: CGPoint = .zero

    init(theme: SnagTheme, environmentLabel: String, onTap: @escaping () -> Void) {
        self.onTap = onTap
        super.init(frame: CGRect(x: 0, y: 0, width: Self.size, height: Self.size))

        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
        blur.frame = bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        blur.layer.cornerRadius = Self.size / 2
        blur.layer.masksToBounds = true
        blur.layer.borderWidth = 1
        blur.layer.borderColor = UIColor.white.withAlphaComponent(0.65).cgColor
        blur.isUserInteractionEnabled = false
        addSubview(blur)

        let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
        let icon = UIImageView(image: UIImage(systemName: "bubble.left", withConfiguration: config))
        icon.tintColor = UIColor(theme.text)
        icon.translatesAutoresizingMaskIntoConstraints = false
        addSubview(icon)
        NSLayoutConstraint.activate([
            icon.centerXAnchor.constraint(equalTo: centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])

        layer.shadowColor = UIColor.black.withAlphaComponent(0.18).cgColor
        layer.shadowOpacity = 1
        layer.shadowRadius = 6
        layer.shadowOffset = CGSize(width: 0, height: 4)

        isAccessibilityElement = true
        accessibilityLabel = "Snag (\(environmentLabel)): request a change on this screen"
        accessibilityTraits = .button

        addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleTap)))
        addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:))))

        // Keeps the default position pinned to the bottom-trailing corner
        // across rotation/resizes.
        autoresizingMask = [.flexibleLeftMargin, .flexibleTopMargin]
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func place(in window: UIWindow) {
        center = CGPoint(
            x: window.bounds.width - Self.size / 2 - Self.edge,
            y: window.bounds.height - Self.size / 2 - Self.bottomInset
        )
    }

    func clampToSuperviewBounds() {
        guard let container = superview else { return }
        center = clamp(center, in: container.bounds.size)
    }

    @objc private func handleTap() {
        onTap()
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard let container = superview else { return }
        switch gesture.state {
        case .began:
            panStartCenter = center
        case .changed, .ended:
            let translation = gesture.translation(in: container)
            center = clamp(
                CGPoint(x: panStartCenter.x + translation.x, y: panStartCenter.y + translation.y),
                in: container.bounds.size
            )
        default:
            break
        }
    }

    private func clamp(_ point: CGPoint, in size: CGSize) -> CGPoint {
        guard size.width > 0, size.height > 0 else { return point }
        let half = Self.size / 2
        return CGPoint(
            x: min(max(point.x, half + Self.edge), size.width - half - Self.edge),
            y: min(max(point.y, half + Self.edge), size.height - half - Self.edge)
        )
    }
}

/// Owns the overlay lifecycle: probe the relay once, and only when the
/// project is enabled attach a floating passthrough window above the app.
/// The native analog of `packages/react/src/components/snag-overlay.tsx`.
@MainActor
final class OverlayController {
    static let shared = OverlayController()

    private var window: SnagPassthroughWindow?
    private var buttonView: SnagFloatingButtonView?
    private var model: OverlayModel?
    private var sceneObserver: NSObjectProtocol?
    private var startTask: Task<Void, Never>?
    private var panelVisibilityCancellable: AnyCancellable?
    private weak var previousKeyWindow: UIWindow?

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
        panelVisibilityCancellable = nil
        buttonView = nil
        // If torn down while the panel is open, hand key status back so the
        // host app is not left without a key window.
        if window?.isKeyWindow == true {
            previousKeyWindow?.makeKey()
        }
        previousKeyWindow = nil
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

        // The SwiftUI hosting view only presents the request panel sheet; it
        // never receives touches directly (see SnagPassthroughWindow).
        let host = UIHostingController(rootView: OverlayRootView(model: model))
        host.view.backgroundColor = .clear

        let window = SnagPassthroughWindow(windowScene: scene)
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.alert.rawValue + 1)
        window.rootViewController = host
        window.isHidden = false

        let button = SnagFloatingButtonView(
            theme: model.configuration.theme,
            environmentLabel: model.environmentLabel,
            onTap: { [weak model] in model?.openPanel() }
        )
        button.place(in: window)
        window.addSubview(button)
        window.floatingButton = button

        // Hide the bubble while the panel sheet is up, and make the overlay
        // window key so text fields inside the sheet can take keyboard focus
        // (a non-key window silently ignores first-responder requests). This
        // sink fires synchronously on the main thread so the window is key
        // BEFORE the sheet presents. Key status is handed back on dismiss.
        let debug = model.configuration.debug
        panelVisibilityCancellable = model.$panelVisible
            .sink { [weak self, weak button] visible in
                guard let self else { return }
                button?.isHidden = visible
                if visible {
                    self.previousKeyWindow = self.window?.windowScene?.windows
                        .first { $0.isKeyWindow }
                    self.window?.makeKey()
                    if debug {
                        print("[Snag] overlay makeKey, isKeyWindow=\(self.window?.isKeyWindow == true)")
                    }
                } else {
                    self.previousKeyWindow?.makeKey()
                    self.previousKeyWindow = nil
                }
            }

        #if DEBUG
        // Test hook (debug builds only): SIMCTL_CHILD_SNAG_AUTO_OPEN_PANEL=1
        // via simctl (delivered to the app as SNAG_AUTO_OPEN_PANEL) opens the
        // panel shortly after attach so automated runs can exercise the sheet.
        if ProcessInfo.processInfo.environment["SNAG_AUTO_OPEN_PANEL"] == "1" {
            Task { @MainActor [weak model] in
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                model?.openPanel()
            }
        }
        #endif

        self.window = window
        self.buttonView = button
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
