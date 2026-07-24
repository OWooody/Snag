#if canImport(SwiftUI)
import SwiftUI

/// Mirrors `packages/react/src/theme.ts`.
public struct SnagTheme {
    public static let defaultAccent = Color(snagHex: 0x5B4CF5)
    public static let defaultBackground = Color(snagHex: 0xFFFFFF)
    public static let defaultSurface = Color(snagHex: 0xF4F3F8)
    public static let defaultText = Color(snagHex: 0x1B1B24)
    public static let defaultTextMuted = Color(snagHex: 0x71717A)
    public static let defaultDanger = Color(snagHex: 0xDC2626)
    public static let defaultSuccess = Color(snagHex: 0x16A34A)

    public var accent: Color
    public var background: Color
    public var surface: Color
    public var text: Color
    public var textMuted: Color
    public var danger: Color
    public var success: Color

    public init(
        accent: Color = SnagTheme.defaultAccent,
        background: Color = SnagTheme.defaultBackground,
        surface: Color = SnagTheme.defaultSurface,
        text: Color = SnagTheme.defaultText,
        textMuted: Color = SnagTheme.defaultTextMuted,
        danger: Color = SnagTheme.defaultDanger,
        success: Color = SnagTheme.defaultSuccess
    ) {
        self.accent = accent
        self.background = background
        self.surface = surface
        self.text = text
        self.textMuted = textMuted
        self.danger = danger
        self.success = success
    }
}

extension Color {
    init(snagHex hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
#endif
