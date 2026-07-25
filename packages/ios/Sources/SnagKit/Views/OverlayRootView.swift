#if canImport(UIKit) && canImport(SwiftUI)
import SwiftUI

/// Root of the overlay window: hosts the request panel sheet only. The
/// floating button is a UIKit view owned by `OverlayController` (see
/// `SnagFloatingButtonView`) so the passthrough window's identity-based hit
/// testing works without syncing SwiftUI frames to window coordinates.
struct OverlayRootView: View {
    @ObservedObject var model: OverlayModel

    var body: some View {
        Color.clear
            .ignoresSafeArea()
            .sheet(isPresented: $model.panelVisible) {
                RequestPanelView(overlay: model)
            }
    }
}
#endif
