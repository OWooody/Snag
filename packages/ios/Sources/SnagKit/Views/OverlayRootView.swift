#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI

/// Root of the overlay window: the floating button plus the request panel
/// sheet. Rendered inside `SnagPassthroughWindow`, so everything outside the
/// button falls through to the host app.
struct OverlayRootView: View {
    @ObservedObject var model: OverlayModel

    var body: some View {
        GeometryReader { geometry in
            if !model.panelVisible {
                FloatingButtonView(
                    theme: model.theme,
                    environmentLabel: model.environmentLabel,
                    containerSize: geometry.size,
                    onTap: { model.openPanel() },
                    // Keeps SnagPassthroughWindow.hitTest in sync with where
                    // the button is drawn. Not @Published — see OverlayModel.
                    onFrameChange: { model.buttonFrame = $0 }
                )
            }
        }
        .ignoresSafeArea()
        .sheet(isPresented: $model.panelVisible) {
            RequestPanelView(overlay: model)
        }
    }
}

/// Mirrors `packages/react/src/components/floating-button.tsx`: a draggable
/// chat-bubble button pinned within screen bounds.
struct FloatingButtonView: View {
    let theme: SnagTheme
    let environmentLabel: String
    let containerSize: CGSize
    let onTap: () -> Void
    /// Reports the button's frame (window coordinates) whenever it moves.
    let onFrameChange: (CGRect) -> Void

    private static let buttonSize: CGFloat = 52
    private static let edge: CGFloat = 12
    private static let bottomInset: CGFloat = 80
    /// Movement below this fires a tap instead of a drag — matches
    /// TAP_SLOP in the web SDK's floating-button.tsx.
    private static let tapSlop: CGFloat = 10

    @State private var anchor: CGPoint?
    @GestureState private var translation: CGSize = .zero

    var body: some View {
        let base = anchor ?? defaultPosition(in: containerSize)
        let position = clamp(
            CGPoint(x: base.x + translation.width, y: base.y + translation.height),
            in: containerSize
        )

        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
            Circle()
                .strokeBorder(Color.white.opacity(0.65), lineWidth: 1)
            Image(systemName: "bubble.left")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(theme.text)
        }
        .frame(width: Self.buttonSize, height: Self.buttonSize)
        .shadow(color: Color.black.opacity(0.18), radius: 6, x: 0, y: 4)
        // Make the whole 52pt square hit-testable, matching the frame the
        // passthrough window checks.
        .contentShape(Rectangle())
        .position(position)
        // Single gesture for both tap and drag (like the web SDK's pointer
        // handlers): the button follows the finger, and releasing within the
        // slop counts as a tap.
        .gesture(
            DragGesture(minimumDistance: 0)
                .updating($translation) { value, state, _ in
                    state = value.translation
                }
                .onEnded { value in
                    anchor = clamp(
                        CGPoint(
                            x: base.x + value.translation.width,
                            y: base.y + value.translation.height
                        ),
                        in: containerSize
                    )
                    let moved = abs(value.translation.width) > Self.tapSlop
                        || abs(value.translation.height) > Self.tapSlop
                    if !moved {
                        onTap()
                    }
                }
        )
        .onAppear {
            onFrameChange(frame(centeredAt: position))
        }
        .onChange(of: position) { newPosition in
            onFrameChange(frame(centeredAt: newPosition))
        }
        .onChange(of: containerSize) { newSize in
            if let current = anchor {
                anchor = clamp(current, in: newSize)
            }
        }
        .accessibilityLabel(
            "Snag (\(environmentLabel)): request a change on this screen"
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            onTap()
        }
    }

    private func frame(centeredAt position: CGPoint) -> CGRect {
        CGRect(
            x: position.x - Self.buttonSize / 2,
            y: position.y - Self.buttonSize / 2,
            width: Self.buttonSize,
            height: Self.buttonSize
        )
    }

    private func defaultPosition(in size: CGSize) -> CGPoint {
        CGPoint(
            x: size.width - Self.buttonSize / 2 - Self.edge,
            y: size.height - Self.buttonSize / 2 - Self.bottomInset
        )
    }

    private func clamp(_ point: CGPoint, in size: CGSize) -> CGPoint {
        let half = Self.buttonSize / 2
        return CGPoint(
            x: min(max(point.x, half + Self.edge), size.width - half - Self.edge),
            y: min(max(point.y, half + Self.edge), size.height - half - Self.edge)
        )
    }
}
#endif
