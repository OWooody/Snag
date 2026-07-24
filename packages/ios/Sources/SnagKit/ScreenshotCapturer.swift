#if canImport(UIKit) && canImport(SwiftUI)
import UIKit

/// Screenshot capture — the native analog of `packages/react/src/screenshot.ts`.
/// Renders the host app's windows (never the Snag overlay window), downscaled
/// to at most 1000px wide, JPEG at 0.7 quality.
@MainActor
enum ScreenshotCapturer {
    static let maxPixelWidth: CGFloat = 1000
    static let jpegQuality: CGFloat = 0.7

    static func capture(excluding excluded: UIWindow?) -> SnagScreenshot? {
        guard let scene = excluded?.windowScene ?? activeScene() else { return nil }

        let windows = scene.windows
            .filter { !$0.isHidden && $0.alpha > 0 && $0 !== excluded && !($0 is SnagPassthroughWindow) }
            .sorted { $0.windowLevel < $1.windowLevel }
        guard let bottom = windows.first else { return nil }

        let bounds = bottom.bounds
        guard bounds.width > 0, bounds.height > 0 else { return nil }

        let scale = min(maxPixelWidth / bounds.width, bottom.screen.scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true

        let renderer = UIGraphicsImageRenderer(bounds: bounds, format: format)
        let image = renderer.image { _ in
            for window in windows {
                window.drawHierarchy(in: window.frame, afterScreenUpdates: false)
            }
        }

        guard let data = image.jpegData(compressionQuality: jpegQuality) else {
            return nil
        }
        return SnagScreenshot(
            base64: data.base64EncodedString(),
            width: Int(bounds.width * scale),
            height: Int(bounds.height * scale)
        )
    }

    private static func activeScene() -> UIWindowScene? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }
}
#endif
