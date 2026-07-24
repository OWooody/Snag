#if canImport(UIKit) && canImport(SwiftUI)
import UIKit

/// Auto-captured device/app context — the native analog of `snag_auto` in
/// `packages/react/src/auto-context.ts`.
@MainActor
enum AutoContext {
    static func build() -> [String: Any] {
        let bundle = Bundle.main
        let device = UIDevice.current
        let screen = UIScreen.main

        var auto: [String: Any] = [
            "platform": "ios",
            "appId": bundle.bundleIdentifier ?? "",
            "appVersion": bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "appBuild": bundle.infoDictionary?["CFBundleVersion"] as? String ?? "",
            "os": "\(device.systemName) \(device.systemVersion)",
            "deviceModel": deviceModelIdentifier(),
            "screen": [
                "width": Int(screen.bounds.width),
                "height": Int(screen.bounds.height),
                "scale": screen.scale,
            ],
            "language": Locale.preferredLanguages.first ?? Locale.current.identifier,
            "timezone": TimeZone.current.identifier,
        ]

        // Best-effort analog of the web SDK's `pathname`.
        if let screenName = topViewControllerName() {
            auto["screenName"] = screenName
        }

        return auto
    }

    /// Hardware identifier like "iPhone16,1" ("arm64" on simulator).
    private static func deviceModelIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        return withUnsafeBytes(of: &systemInfo.machine) { buffer in
            let data = Data(buffer.prefix(while: { $0 != 0 }))
            return String(data: data, encoding: .ascii) ?? "unknown"
        }
    }

    private static func topViewControllerName() -> String? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
        let window = scenes
            .flatMap { $0.windows }
            .first { $0.isKeyWindow && !($0 is SnagPassthroughWindow) }
        guard var controller = window?.rootViewController else { return nil }

        while true {
            if let presented = controller.presentedViewController {
                controller = presented
            } else if let navigation = controller as? UINavigationController,
                      let top = navigation.topViewController {
                controller = top
            } else if let tab = controller as? UITabBarController,
                      let selected = tab.selectedViewController {
                controller = selected
            } else {
                break
            }
        }
        return String(describing: type(of: controller))
    }
}
#endif
